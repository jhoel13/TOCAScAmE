import type { Matrix, UnitSystem } from "./truss";
import { FORCE_TO_N, LENGTH_TO_M, STRESS_TO_PA } from "./truss";

export function formatNumber(value: number, precision = 5) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) < 1e-14) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6 || magnitude < 1e-4) return value.toExponential(Math.max(2, precision - 1));
  return new Intl.NumberFormat("es-PE", {
    maximumFractionDigits: precision,
    minimumFractionDigits: 0,
  }).format(value);
}

export function stiffnessFromSI(value: number, units: UnitSystem) {
  return (value * LENGTH_TO_M[units.length]) / FORCE_TO_N[units.force];
}

export function displacementFromSI(value: number, units: UnitSystem) {
  return value / LENGTH_TO_M[units.length];
}

export function forceFromSI(value: number, units: UnitSystem) {
  return value / FORCE_TO_N[units.force];
}

export function stressFromSI(value: number, units: UnitSystem) {
  return value / STRESS_TO_PA[units.stress];
}

export function mapMatrix(matrix: Matrix, transform: (value: number) => number) {
  return matrix.map((row) => row.map(transform));
}

export function matrixToRows(matrix: Matrix, transform = (value: number) => value) {
  return matrix.map((row, rowIndex) => [
    rowIndex + 1,
    ...row.map((value) => formatNumber(transform(value), 6)),
  ]);
}

