export type LengthUnit = "mm" | "cm" | "m";
export type AreaUnit = "mm²" | "cm²" | "m²";
export type ForceUnit = "N" | "kN" | "kgf" | "tf";
export type StressUnit =
  | "Pa"
  | "kPa"
  | "MPa"
  | "GPa"
  | "kgf/cm²"
  | "kN/cm²";

export type UnitSystem = {
  length: LengthUnit;
  area: AreaUnit;
  force: ForceUnit;
  stress: StressUnit;
};

export type ProjectInfo = {
  id: string;
  name: string;
  description: string;
  author: string;
  date: string;
  observations: string;
};

export type TrussNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  restraintX: boolean;
  restraintY: boolean;
  fx: number;
  fy: number;
};

export type TrussElement = {
  id: string;
  label: string;
  nodeI: string;
  nodeJ: string;
  area: number;
  elasticModulus: number;
  material: string;
};

export type TrussModel = {
  project: ProjectInfo;
  units: UnitSystem;
  nodes: TrussNode[];
  elements: TrussElement[];
};

export type Matrix = number[][];

export type ElementResult = {
  id: string;
  label: string;
  nodeI: string;
  nodeJ: string;
  length: number;
  cosine: number;
  sine: number;
  angleDegrees: number;
  area: number;
  elasticModulus: number;
  dofs: number[];
  transform: Matrix;
  localAxialStiffness: Matrix;
  localExpandedStiffness: Matrix;
  globalStiffness: Matrix;
  nodalDisplacements: number[];
  localDisplacements: number[];
  axialDeformation: number;
  strain: number;
  stress: number;
  axialForce: number;
  classification: "Tracción" | "Compresión" | "Nulo";
};

export type AssemblyStep = {
  elementId: string;
  elementLabel: string;
  dofs: number[];
  contribution: Matrix;
  cumulative?: Matrix;
};

export type AnalysisResult = {
  ok: true;
  ndof: number;
  freeDofs: number[];
  restrainedDofs: number[];
  forceVector: number[];
  globalStiffness: Matrix;
  kff: Matrix;
  kfr: Matrix;
  krf: Matrix;
  krr: Matrix;
  forceFree: number[];
  forceRestrained: number[];
  displacements: number[];
  reactions: number[];
  elementResults: ElementResult[];
  assemblySteps: AssemblyStep[];
  maxDisplacement: number;
  equilibrium: {
    externalX: number;
    externalY: number;
    reactionX: number;
    reactionY: number;
    residualX: number;
    residualY: number;
    externalMoment: number;
    reactionMoment: number;
    residualMoment: number;
    relativeResidual: number;
    passed: boolean;
  };
  solver: {
    minPivot: number;
    maxPivot: number;
    pivotRatio: number;
  };
  warnings: string[];
};

export type AnalysisFailure = {
  ok: false;
  errors: string[];
  warnings: string[];
};

export type AnalysisOutput = AnalysisResult | AnalysisFailure;

export const LENGTH_TO_M: Record<LengthUnit, number> = {
  mm: 1e-3,
  cm: 1e-2,
  m: 1,
};

export const AREA_TO_M2: Record<AreaUnit, number> = {
  "mm²": 1e-6,
  "cm²": 1e-4,
  "m²": 1,
};

export const FORCE_TO_N: Record<ForceUnit, number> = {
  N: 1,
  kN: 1e3,
  kgf: 9.80665,
  tf: 9806.65,
};

export const STRESS_TO_PA: Record<StressUnit, number> = {
  Pa: 1,
  kPa: 1e3,
  MPa: 1e6,
  GPa: 1e9,
  "kgf/cm²": 98066.5,
  "kN/cm²": 1e7,
};

export const unitLabel = {
  stiffness: "N/m",
  displacement: "m",
  force: "N",
  stress: "Pa",
};

const zeros = (rows: number, cols: number): Matrix =>
  Array.from({ length: rows }, () => Array(cols).fill(0));

const vectorZeros = (size: number): number[] => Array(size).fill(0);

const pickMatrix = (matrix: Matrix, rows: number[], cols: number[]): Matrix =>
  rows.map((row) => cols.map((col) => matrix[row][col]));

const pickVector = (vector: number[], indices: number[]): number[] =>
  indices.map((index) => vector[index]);

const multiplyMatrixVector = (matrix: Matrix, vector: number[]): number[] =>
  matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));

const subtractVectors = (a: number[], b: number[]): number[] =>
  a.map((value, index) => value - b[index]);

function solveWithPivoting(matrix: Matrix, rhs: number[]) {
  const n = rhs.length;
  const augmented = matrix.map((row, index) => [...row, rhs[index]]);
  const matrixScale = Math.max(1, ...matrix.flat().map(Math.abs));
  const tolerance = matrixScale * 1e-12;
  let minPivot = Number.POSITIVE_INFINITY;
  let maxPivot = 0;

  for (let column = 0; column < n; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) {
        pivotRow = row;
      }
    }

    const pivotValue = Math.abs(augmented[pivotRow][column]);
    if (!Number.isFinite(pivotValue) || pivotValue <= tolerance) {
      throw new Error(
        "La matriz reducida es singular o casi singular. Revise apoyos, conectividad y mecanismos internos.",
      );
    }

    if (pivotRow !== column) {
      [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];
    }

    minPivot = Math.min(minPivot, pivotValue);
    maxPivot = Math.max(maxPivot, pivotValue);

    for (let row = column + 1; row < n; row += 1) {
      const factor = augmented[row][column] / augmented[column][column];
      augmented[row][column] = 0;
      for (let entry = column + 1; entry <= n; entry += 1) {
        augmented[row][entry] -= factor * augmented[column][entry];
      }
    }
  }

  const solution = vectorZeros(n);
  for (let row = n - 1; row >= 0; row -= 1) {
    let value = augmented[row][n];
    for (let column = row + 1; column < n; column += 1) {
      value -= augmented[row][column] * solution[column];
    }
    solution[row] = value / augmented[row][row];
  }

  return {
    solution,
    minPivot,
    maxPivot,
    pivotRatio: maxPivot === 0 ? 0 : minPivot / maxPivot,
  };
}

function validateModel(model: TrussModel) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeIds = new Set<string>();
  const labels = new Set<string>();

  if (model.nodes.length < 2) errors.push("Se requieren al menos 2 nodos.");
  if (model.elements.length < 1) errors.push("Se requiere al menos 1 elemento.");

  model.nodes.forEach((node, index) => {
    if (!node.id || nodeIds.has(node.id)) errors.push(`Nodo ${index + 1}: identificador repetido o vacío.`);
    if (!node.label.trim() || labels.has(node.label.trim().toLowerCase())) {
      errors.push(`Nodo ${index + 1}: nombre repetido o vacío.`);
    }
    nodeIds.add(node.id);
    labels.add(node.label.trim().toLowerCase());
    if (![node.x, node.y, node.fx, node.fy].every(Number.isFinite)) {
      errors.push(`Nodo ${node.label || index + 1}: hay coordenadas o cargas no numéricas.`);
    }
  });

  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const connections = new Set<string>();
  const usedNodes = new Set<string>();

  model.elements.forEach((element, index) => {
    const prefix = `Elemento ${element.label || index + 1}`;
    const nodeI = nodeById.get(element.nodeI);
    const nodeJ = nodeById.get(element.nodeJ);
    if (!nodeI || !nodeJ) {
      errors.push(`${prefix}: referencia un nodo inexistente.`);
      return;
    }
    if (element.nodeI === element.nodeJ) errors.push(`${prefix}: el nodo inicial y final son iguales.`);
    if (!Number.isFinite(element.area) || element.area <= 0) errors.push(`${prefix}: el área debe ser mayor que cero.`);
    if (!Number.isFinite(element.elasticModulus) || element.elasticModulus <= 0) {
      errors.push(`${prefix}: el módulo E debe ser mayor que cero.`);
    }

    const key = [element.nodeI, element.nodeJ].sort().join("::");
    if (connections.has(key)) errors.push(`${prefix}: conexión duplicada entre los mismos nodos.`);
    connections.add(key);
    usedNodes.add(element.nodeI);
    usedNodes.add(element.nodeJ);

    const length = Math.hypot(nodeJ.x - nodeI.x, nodeJ.y - nodeI.y);
    if (!Number.isFinite(length) || length <= 1e-12) errors.push(`${prefix}: longitud cero.`);
  });

  model.nodes.forEach((node) => {
    if (!usedNodes.has(node.id)) warnings.push(`El nodo ${node.label} no está conectado a ningún elemento.`);
  });

  const restraintCount = model.nodes.reduce(
    (sum, node) => sum + Number(node.restraintX) + Number(node.restraintY),
    0,
  );
  if (restraintCount < 3) warnings.push("Una armadura plana suele requerir al menos 3 restricciones independientes.");

  const maxwell = model.elements.length + restraintCount - 2 * model.nodes.length;
  if (maxwell < 0) {
    warnings.push(
      `Criterio preliminar de Maxwell: m + r − 2j = ${maxwell}; puede existir un mecanismo.`,
    );
  }

  if (model.nodes.every((node) => Math.abs(node.fx) < 1e-15 && Math.abs(node.fy) < 1e-15)) {
    warnings.push("No se han definido cargas nodales; la respuesta será nula si el sistema es estable.");
  }

  return { errors, warnings };
}

export function analyzeTruss(model: TrussModel): AnalysisOutput {
  const validation = validateModel(model);
  if (validation.errors.length) return { ok: false, ...validation };

  const lengthFactor = LENGTH_TO_M[model.units.length];
  const areaFactor = AREA_TO_M2[model.units.area];
  const forceFactor = FORCE_TO_N[model.units.force];
  const stressFactor = STRESS_TO_PA[model.units.stress];
  const ndof = model.nodes.length * 2;
  const globalStiffness = zeros(ndof, ndof);
  const forceVector = vectorZeros(ndof);
  const nodeIndex = new Map(model.nodes.map((node, index) => [node.id, index]));
  const assemblySteps: AssemblyStep[] = [];

  model.nodes.forEach((node, index) => {
    forceVector[2 * index] = node.fx * forceFactor;
    forceVector[2 * index + 1] = node.fy * forceFactor;
  });

  const geometry = model.elements.map((element) => {
    const indexI = nodeIndex.get(element.nodeI)!;
    const indexJ = nodeIndex.get(element.nodeJ)!;
    const nodeI = model.nodes[indexI];
    const nodeJ = model.nodes[indexJ];
    const dx = (nodeJ.x - nodeI.x) * lengthFactor;
    const dy = (nodeJ.y - nodeI.y) * lengthFactor;
    const length = Math.hypot(dx, dy);
    const cosine = dx / length;
    const sine = dy / length;
    const area = element.area * areaFactor;
    const elasticModulus = element.elasticModulus * stressFactor;
    const axialStiffness = (area * elasticModulus) / length;
    const c2 = cosine * cosine;
    const s2 = sine * sine;
    const cs = cosine * sine;
    const dofs = [2 * indexI, 2 * indexI + 1, 2 * indexJ, 2 * indexJ + 1];
    const transform = [
      [cosine, sine, 0, 0],
      [0, 0, cosine, sine],
    ];
    const localAxialStiffness = [
      [axialStiffness, -axialStiffness],
      [-axialStiffness, axialStiffness],
    ];
    const localExpandedStiffness = [
      [axialStiffness, 0, -axialStiffness, 0],
      [0, 0, 0, 0],
      [-axialStiffness, 0, axialStiffness, 0],
      [0, 0, 0, 0],
    ];
    const globalStiffnessElement = [
      [c2, cs, -c2, -cs],
      [cs, s2, -cs, -s2],
      [-c2, -cs, c2, cs],
      [-cs, -s2, cs, s2],
    ].map((row) => row.map((entry) => entry * axialStiffness));

    dofs.forEach((globalRow, localRow) => {
      dofs.forEach((globalColumn, localColumn) => {
        globalStiffness[globalRow][globalColumn] +=
          globalStiffnessElement[localRow][localColumn];
      });
    });

    assemblySteps.push({
      elementId: element.id,
      elementLabel: element.label,
      dofs: dofs.map((dof) => dof + 1),
      contribution: globalStiffnessElement,
      cumulative: ndof <= 16 ? globalStiffness.map((row) => [...row]) : undefined,
    });

    return {
      element,
      length,
      cosine,
      sine,
      area,
      elasticModulus,
      dofs,
      transform,
      localAxialStiffness,
      localExpandedStiffness,
      globalStiffnessElement,
    };
  });

  const restrainedDofs: number[] = [];
  model.nodes.forEach((node, index) => {
    if (node.restraintX) restrainedDofs.push(2 * index);
    if (node.restraintY) restrainedDofs.push(2 * index + 1);
  });
  const restrainedSet = new Set(restrainedDofs);
  const freeDofs = Array.from({ length: ndof }, (_, index) => index).filter(
    (dof) => !restrainedSet.has(dof),
  );

  if (!freeDofs.length) {
    return {
      ok: false,
      errors: ["Todos los grados de libertad están restringidos; no existe un sistema reducido que resolver."],
      warnings: validation.warnings,
    };
  }

  const kff = pickMatrix(globalStiffness, freeDofs, freeDofs);
  const kfr = pickMatrix(globalStiffness, freeDofs, restrainedDofs);
  const krf = pickMatrix(globalStiffness, restrainedDofs, freeDofs);
  const krr = pickMatrix(globalStiffness, restrainedDofs, restrainedDofs);
  const forceFree = pickVector(forceVector, freeDofs);
  const forceRestrained = pickVector(forceVector, restrainedDofs);

  let solver;
  try {
    solver = solveWithPivoting(kff, forceFree);
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : "No fue posible resolver el sistema reducido."],
      warnings: validation.warnings,
    };
  }

  const displacements = vectorZeros(ndof);
  freeDofs.forEach((dof, index) => {
    displacements[dof] = solver.solution[index];
  });
  const reactions = subtractVectors(multiplyMatrixVector(globalStiffness, displacements), forceVector);

  const elementResults: ElementResult[] = geometry.map((item) => {
    const nodalDisplacements = item.dofs.map((dof) => displacements[dof]);
    const localDisplacements = [
      item.cosine * nodalDisplacements[0] + item.sine * nodalDisplacements[1],
      item.cosine * nodalDisplacements[2] + item.sine * nodalDisplacements[3],
    ];
    const axialDeformation = localDisplacements[1] - localDisplacements[0];
    const strain = axialDeformation / item.length;
    const stress = item.elasticModulus * strain;
    const axialForce = item.area * stress;
    const forceTolerance = Math.max(1e-8, Math.max(...forceVector.map(Math.abs)) * 1e-10);

    return {
      id: item.element.id,
      label: item.element.label,
      nodeI: item.element.nodeI,
      nodeJ: item.element.nodeJ,
      length: item.length,
      cosine: item.cosine,
      sine: item.sine,
      angleDegrees: (Math.atan2(item.sine, item.cosine) * 180) / Math.PI,
      area: item.area,
      elasticModulus: item.elasticModulus,
      dofs: item.dofs.map((dof) => dof + 1),
      transform: item.transform,
      localAxialStiffness: item.localAxialStiffness,
      localExpandedStiffness: item.localExpandedStiffness,
      globalStiffness: item.globalStiffnessElement,
      nodalDisplacements,
      localDisplacements,
      axialDeformation,
      strain,
      stress,
      axialForce,
      classification:
        Math.abs(axialForce) <= forceTolerance
          ? "Nulo"
          : axialForce > 0
            ? "Tracción"
            : "Compresión",
    };
  });

  let externalX = 0;
  let externalY = 0;
  let reactionX = 0;
  let reactionY = 0;
  let externalMoment = 0;
  let reactionMoment = 0;
  model.nodes.forEach((node, index) => {
    const x = node.x * lengthFactor;
    const y = node.y * lengthFactor;
    const fx = forceVector[2 * index];
    const fy = forceVector[2 * index + 1];
    const rx = reactions[2 * index];
    const ry = reactions[2 * index + 1];
    externalX += fx;
    externalY += fy;
    reactionX += rx;
    reactionY += ry;
    externalMoment += x * fy - y * fx;
    reactionMoment += x * ry - y * rx;
  });
  const residualX = externalX + reactionX;
  const residualY = externalY + reactionY;
  const residualMoment = externalMoment + reactionMoment;
  const loadScale = Math.max(
    1,
    Math.abs(externalX),
    Math.abs(externalY),
    Math.abs(reactionX),
    Math.abs(reactionY),
  );
  const momentScale = Math.max(1, Math.abs(externalMoment), Math.abs(reactionMoment));
  const relativeResidual = Math.max(
    Math.abs(residualX) / loadScale,
    Math.abs(residualY) / loadScale,
    Math.abs(residualMoment) / momentScale,
  );
  const maxDisplacement = Math.max(
    0,
    ...model.nodes.map((_, index) =>
      Math.hypot(displacements[2 * index], displacements[2 * index + 1]),
    ),
  );

  if (solver.pivotRatio < 1e-9) {
    validation.warnings.push(
      "El sistema está mal condicionado; revise geometría, rigideces muy dispares o apoyos insuficientes.",
    );
  }

  return {
    ok: true,
    ndof,
    freeDofs: freeDofs.map((dof) => dof + 1),
    restrainedDofs: restrainedDofs.map((dof) => dof + 1),
    forceVector,
    globalStiffness,
    kff,
    kfr,
    krf,
    krr,
    forceFree,
    forceRestrained,
    displacements,
    reactions,
    elementResults,
    assemblySteps,
    maxDisplacement,
    equilibrium: {
      externalX,
      externalY,
      reactionX,
      reactionY,
      residualX,
      residualY,
      externalMoment,
      reactionMoment,
      residualMoment,
      relativeResidual,
      passed: relativeResidual < 1e-8,
    },
    solver: {
      minPivot: solver.minPivot,
      maxPivot: solver.maxPivot,
      pivotRatio: solver.pivotRatio,
    },
    warnings: validation.warnings,
  };
}

export function fromSI(value: number, kind: "length" | "force" | "stress", units: UnitSystem) {
  if (kind === "length") return value / LENGTH_TO_M[units.length];
  if (kind === "force") return value / FORCE_TO_N[units.force];
  return value / STRESS_TO_PA[units.stress];
}

const today = () => new Date().toISOString().slice(0, 10);

export const exampleTriangle: TrussModel = {
  project: {
    id: "example-triangle",
    name: "Ejemplo 1 — Armadura triangular",
    description: "Armadura simétrica de tres barras con carga vertical en la cumbrera.",
    author: "Jhoel Tocas Cercado",
    date: today(),
    observations: "Ejemplo didáctico en unidades kN–m–GPa.",
  },
  units: { length: "m", area: "cm²", force: "kN", stress: "GPa" },
  nodes: [
    { id: "n1", label: "A", x: 0, y: 0, restraintX: true, restraintY: true, fx: 0, fy: 0 },
    { id: "n2", label: "B", x: 4, y: 0, restraintX: false, restraintY: true, fx: 0, fy: 0 },
    { id: "n3", label: "C", x: 2, y: 3, restraintX: false, restraintY: false, fx: 0, fy: -100 },
  ],
  elements: [
    { id: "e1", label: "1", nodeI: "n1", nodeJ: "n2", area: 20, elasticModulus: 200, material: "Acero" },
    { id: "e2", label: "2", nodeI: "n1", nodeJ: "n3", area: 20, elasticModulus: 200, material: "Acero" },
    { id: "e3", label: "3", nodeI: "n2", nodeJ: "n3", area: 20, elasticModulus: 200, material: "Acero" },
  ],
};

export const exampleBridge: TrussModel = {
  project: {
    id: "example-bridge",
    name: "Ejemplo 2 — Armadura de panel",
    description: "Panel rectangular arriostrado con propiedades independientes por elemento.",
    author: "Jhoel Tocas Cercado",
    date: today(),
    observations: "Ejemplo con áreas variables y dos cargas nodales.",
  },
  units: { length: "m", area: "cm²", force: "kN", stress: "GPa" },
  nodes: [
    { id: "n1", label: "A", x: 0, y: 0, restraintX: true, restraintY: true, fx: 0, fy: 0 },
    { id: "n2", label: "B", x: 5, y: 0, restraintX: false, restraintY: true, fx: 0, fy: 0 },
    { id: "n3", label: "C", x: 0, y: 3, restraintX: false, restraintY: false, fx: 15, fy: -45 },
    { id: "n4", label: "D", x: 5, y: 3, restraintX: false, restraintY: false, fx: 0, fy: -70 },
  ],
  elements: [
    { id: "e1", label: "1", nodeI: "n1", nodeJ: "n2", area: 28, elasticModulus: 200, material: "Acero" },
    { id: "e2", label: "2", nodeI: "n1", nodeJ: "n3", area: 24, elasticModulus: 200, material: "Acero" },
    { id: "e3", label: "3", nodeI: "n3", nodeJ: "n4", area: 22, elasticModulus: 200, material: "Acero" },
    { id: "e4", label: "4", nodeI: "n4", nodeJ: "n2", area: 26, elasticModulus: 200, material: "Acero" },
    { id: "e5", label: "5", nodeI: "n1", nodeJ: "n4", area: 30, elasticModulus: 210, material: "Acero alta resistencia" },
  ],
};

export const materialLibrary = [
  { name: "Acero", elasticModulusGPa: 200 },
  { name: "Concreto", elasticModulusGPa: 25 },
  { name: "Aluminio", elasticModulusGPa: 69 },
  { name: "Madera", elasticModulusGPa: 11 },
  { name: "Personalizado", elasticModulusGPa: 1 },
];

