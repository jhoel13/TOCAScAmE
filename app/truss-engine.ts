export type TrussNode = {
  id: string;
  x: number;
  y: number;
  restraintX: boolean;
  restraintY: boolean;
  fx: number;
  fy: number;
};

export type TrussElement = {
  id: string;
  start: string;
  end: string;
  area: number;
  elasticModulus: number;
};

export type TrussModel = {
  name: string;
  description: string;
  source: string;
  lengthUnit: string;
  forceUnit: string;
  nodes: TrussNode[];
  elements: TrussElement[];
};

export type ElementAnalysis = {
  id: string;
  start: string;
  end: string;
  length: number;
  cosine: number;
  sine: number;
  dofs: number[];
  localMatrix: number[][];
  transformation: number[][];
  globalMatrix: number[][];
  extension: number;
  strain: number;
  stress: number;
  axialForce: number;
  localEndForces: number[];
  globalEndForces: number[];
  behavior: "Tracción" | "Compresión" | "Sin esfuerzo";
};

export type AnalysisResult = {
  dofLabels: string[];
  restrictedDofs: number[];
  freeDofs: number[];
  loadedDofs: number[];
  forceVector: number[];
  globalMatrix: number[][];
  freeMatrix: number[][];
  freeForceVector: number[];
  displacements: number[];
  internalNodalForces: number[];
  reactions: number[];
  elements: ElementAnalysis[];
  residualNorm: number;
  maxDisplacement: number;
  maxAxialForce: number;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

function zeros(rows: number, columns: number): number[][] {
  return Array.from({ length: rows }, () => Array(columns).fill(0));
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function gaussianSolve(matrix: number[][], vector: number[]): number[] {
  const n = matrix.length;
  if (n === 0) return [];
  const a = matrix.map((row, index) => [...row, vector[index]]);
  const scale = Math.max(1, ...matrix.flat().map((value) => Math.abs(value)));
  const tolerance = scale * 1e-12;

  for (let column = 0; column < n; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivotRow][column])) pivotRow = row;
    }
    if (Math.abs(a[pivotRow][column]) <= tolerance) {
      throw new Error("La matriz de rigidez libre es singular. Revisa apoyos, barras desconectadas o mecanismos inestables.");
    }
    [a[column], a[pivotRow]] = [a[pivotRow], a[column]];

    for (let row = column + 1; row < n; row += 1) {
      const factor = a[row][column] / a[column][column];
      a[row][column] = 0;
      for (let k = column + 1; k <= n; k += 1) a[row][k] -= factor * a[column][k];
    }
  }

  const solution = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let value = a[row][n];
    for (let column = row + 1; column < n; column += 1) value -= a[row][column] * solution[column];
    solution[row] = value / a[row][row];
  }
  return solution;
}

export function validateModel(model: TrussModel): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (model.nodes.length < 2) errors.push("Se requieren al menos dos nodos.");
  if (model.elements.length < 1) errors.push("Se requiere al menos una barra.");

  const nodeIds = new Set<string>();
  for (const node of model.nodes) {
    const id = node.id.trim();
    if (!id) errors.push("Todos los nodos deben tener un identificador.");
    if (nodeIds.has(id)) errors.push(`El nodo ${id} está duplicado.`);
    nodeIds.add(id);
    if (![node.x, node.y, node.fx, node.fy].every(Number.isFinite)) errors.push(`El nodo ${id || "sin nombre"} contiene un dato no numérico.`);
  }

  const elementIds = new Set<string>();
  const connections = new Set<string>();
  for (const element of model.elements) {
    if (!element.id.trim()) errors.push("Todas las barras deben tener un identificador.");
    if (elementIds.has(element.id)) errors.push(`La barra ${element.id} está duplicada.`);
    elementIds.add(element.id);
    if (!nodeIds.has(element.start) || !nodeIds.has(element.end)) errors.push(`La barra ${element.id} referencia un nodo inexistente.`);
    if (element.start === element.end) errors.push(`La barra ${element.id} inicia y termina en el mismo nodo.`);
    if (!Number.isFinite(element.area) || element.area <= 0) errors.push(`El área de ${element.id} debe ser positiva.`);
    if (!Number.isFinite(element.elasticModulus) || element.elasticModulus <= 0) errors.push(`El módulo E de ${element.id} debe ser positivo.`);
    const key = [element.start, element.end].sort().join("::");
    if (connections.has(key)) errors.push(`Existe más de una barra entre ${element.start} y ${element.end}.`);
    connections.add(key);
    const ni = model.nodes.find((node) => node.id === element.start);
    const nj = model.nodes.find((node) => node.id === element.end);
    if (ni && nj && Math.hypot(nj.x - ni.x, nj.y - ni.y) < 1e-12) errors.push(`La barra ${element.id} tiene longitud cero.`);
  }

  const restricted = model.nodes.reduce((count, node) => count + Number(node.restraintX) + Number(node.restraintY), 0);
  if (restricted < 3) warnings.push("Una armadura plana normalmente necesita al menos tres restricciones independientes.");
  if (!model.nodes.some((node) => node.fx !== 0 || node.fy !== 0)) warnings.push("No se han definido cargas nodales.");

  return { valid: errors.length === 0, errors, warnings };
}

export function analyzeTruss(model: TrussModel): AnalysisResult {
  const validation = validateModel(model);
  if (!validation.valid) throw new Error(validation.errors.join(" "));

  const nodeIndex = new Map(model.nodes.map((node, index) => [node.id, index]));
  const dofCount = model.nodes.length * 2;
  const globalMatrix = zeros(dofCount, dofCount);
  const forceVector = Array(dofCount).fill(0);
  const restrictedDofs: number[] = [];
  const loadedDofs: number[] = [];
  const dofLabels = model.nodes.flatMap((node) => [`${node.id}x`, `${node.id}y`]);

  model.nodes.forEach((node, index) => {
    forceVector[index * 2] = node.fx;
    forceVector[index * 2 + 1] = node.fy;
    if (node.restraintX) restrictedDofs.push(index * 2);
    if (node.restraintY) restrictedDofs.push(index * 2 + 1);
    if (node.fx !== 0) loadedDofs.push(index * 2);
    if (node.fy !== 0) loadedDofs.push(index * 2 + 1);
  });

  const elementGeometry = model.elements.map((element) => {
    const i = nodeIndex.get(element.start)!;
    const j = nodeIndex.get(element.end)!;
    const start = model.nodes[i];
    const end = model.nodes[j];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    const cosine = dx / length;
    const sine = dy / length;
    const axial = (element.area * element.elasticModulus) / length;
    const localMatrix = [[axial, -axial], [-axial, axial]];
    const transformation = [[cosine, sine, 0, 0], [0, 0, cosine, sine]];
    const globalMatrixElement = [
      [axial * cosine * cosine, axial * cosine * sine, -axial * cosine * cosine, -axial * cosine * sine],
      [axial * cosine * sine, axial * sine * sine, -axial * cosine * sine, -axial * sine * sine],
      [-axial * cosine * cosine, -axial * cosine * sine, axial * cosine * cosine, axial * cosine * sine],
      [-axial * cosine * sine, -axial * sine * sine, axial * cosine * sine, axial * sine * sine],
    ];
    const dofs = [i * 2, i * 2 + 1, j * 2, j * 2 + 1];
    dofs.forEach((rowDof, row) => dofs.forEach((columnDof, column) => {
      globalMatrix[rowDof][columnDof] += globalMatrixElement[row][column];
    }));
    return { element, length, cosine, sine, localMatrix, transformation, globalMatrixElement, dofs };
  });

  const restrictedSet = new Set(restrictedDofs);
  const freeDofs = Array.from({ length: dofCount }, (_, index) => index).filter((index) => !restrictedSet.has(index));
  if (!freeDofs.length) throw new Error("No existen grados de libertad libres para resolver.");
  const freeMatrix = freeDofs.map((row) => freeDofs.map((column) => globalMatrix[row][column]));
  const freeForceVector = freeDofs.map((dof) => forceVector[dof]);
  const freeDisplacements = gaussianSolve(freeMatrix, freeForceVector);
  const displacements = Array(dofCount).fill(0);
  freeDofs.forEach((dof, index) => { displacements[dof] = freeDisplacements[index]; });

  const internalNodalForces = multiplyMatrixVector(globalMatrix, displacements);
  const reactions = internalNodalForces.map((value, index) => value - forceVector[index]);
  const residualNorm = Math.sqrt(freeDofs.reduce((sum, dof) => sum + reactions[dof] ** 2, 0));

  const elements: ElementAnalysis[] = elementGeometry.map(({ element, length, cosine, sine, localMatrix, transformation, globalMatrixElement, dofs }) => {
    const elementDisplacements = dofs.map((dof) => displacements[dof]);
    const extension = -cosine * elementDisplacements[0] - sine * elementDisplacements[1] + cosine * elementDisplacements[2] + sine * elementDisplacements[3];
    const strain = extension / length;
    const stress = element.elasticModulus * strain;
    const axialForce = element.area * stress;
    const tolerance = Math.max(1, Math.abs(element.area * element.elasticModulus)) * 1e-10;
    const behavior = axialForce > tolerance ? "Tracción" : axialForce < -tolerance ? "Compresión" : "Sin esfuerzo";
    return {
      id: element.id,
      start: element.start,
      end: element.end,
      length,
      cosine,
      sine,
      dofs,
      localMatrix,
      transformation,
      globalMatrix: globalMatrixElement,
      extension,
      strain,
      stress,
      axialForce,
      localEndForces: [-axialForce, axialForce],
      globalEndForces: [-axialForce * cosine, -axialForce * sine, axialForce * cosine, axialForce * sine],
      behavior,
    };
  });

  return {
    dofLabels,
    restrictedDofs,
    freeDofs,
    loadedDofs,
    forceVector,
    globalMatrix,
    freeMatrix,
    freeForceVector,
    displacements,
    internalNodalForces,
    reactions,
    elements,
    residualNorm,
    maxDisplacement: Math.max(...model.nodes.map((_, index) => Math.hypot(displacements[index * 2], displacements[index * 2 + 1]))),
    maxAxialForce: Math.max(...elements.map((element) => Math.abs(element.axialForce))),
  };
}

export function deepCloneModel(model: TrussModel): TrussModel {
  return JSON.parse(JSON.stringify(model)) as TrussModel;
}

export function formatNumber(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) < 1e-14) return "0";
  const absolute = Math.abs(value);
  if (absolute >= 1e5 || absolute < 1e-3) return value.toExponential(digits);
  return value.toLocaleString("es-PE", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
