import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeTruss,
  exampleBridge,
  exampleTriangle,
  type TrussModel,
} from "../lib/truss";

const closeTo = (actual: number, expected: number, tolerance: number, message?: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, message ?? `${actual} ≉ ${expected}`);

test("el ejemplo triangular reproduce las reacciones y fuerzas axiales esperadas", () => {
  const output = analyzeTruss(exampleTriangle);
  assert.equal(output.ok, true);
  if (!output.ok) return;

  closeTo(output.reactions[1], 50_000, 1e-7);
  closeTo(output.reactions[3], 50_000, 1e-7);
  closeTo(output.elementResults[0].axialForce, 33_333.3333333333, 1e-6);
  closeTo(output.elementResults[1].axialForce, -60_092.5212577332, 1e-6);
  closeTo(output.elementResults[2].axialForce, -60_092.5212577332, 1e-6);
  assert.equal(output.elementResults[0].classification, "Tracción");
  assert.equal(output.elementResults[1].classification, "Compresión");
  assert.equal(output.equilibrium.passed, true);
  assert.ok(output.equilibrium.relativeResidual < 1e-12);
});

test("la matriz global es simétrica", () => {
  const output = analyzeTruss(exampleBridge);
  assert.equal(output.ok, true);
  if (!output.ok) return;

  for (let row = 0; row < output.ndof; row += 1) {
    for (let column = 0; column < output.ndof; column += 1) {
      closeTo(
        output.globalStiffness[row][column],
        output.globalStiffness[column][row],
        Math.max(1e-7, Math.abs(output.globalStiffness[row][column]) * 1e-12),
      );
    }
  }
});

test("el ejemplo de panel satisface equilibrio de fuerzas y momentos", () => {
  const output = analyzeTruss(exampleBridge);
  assert.equal(output.ok, true);
  if (!output.ok) return;

  closeTo(output.equilibrium.reactionX, -15_000, 1e-7);
  closeTo(output.equilibrium.reactionY, 115_000, 1e-7);
  closeTo(output.equilibrium.reactionMoment, 395_000, 1e-6);
  assert.equal(output.equilibrium.passed, true);
});

test("una armadura sin apoyos se detecta como sistema singular", () => {
  const unstable: TrussModel = JSON.parse(JSON.stringify(exampleTriangle));
  unstable.nodes = unstable.nodes.map((node) => ({
    ...node,
    restraintX: false,
    restraintY: false,
  }));
  const output = analyzeTruss(unstable);
  assert.equal(output.ok, false);
  if (output.ok) return;
  assert.match(output.errors.join(" "), /singular|mecanismo/i);
});

test("una conexión duplicada bloquea el cálculo", () => {
  const duplicated: TrussModel = JSON.parse(JSON.stringify(exampleTriangle));
  duplicated.elements.push({
    ...duplicated.elements[0],
    id: "duplicated",
    label: "4",
    nodeI: duplicated.elements[0].nodeJ,
    nodeJ: duplicated.elements[0].nodeI,
  });
  const output = analyzeTruss(duplicated);
  assert.equal(output.ok, false);
  if (output.ok) return;
  assert.match(output.errors.join(" "), /duplicada/i);
});

