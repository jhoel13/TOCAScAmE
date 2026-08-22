"use client";

import type { Matrix } from "@/lib/truss";
import { formatNumber } from "@/lib/format";

type Props = {
  matrix: Matrix;
  unit?: string;
  transform?: (value: number) => number;
  rowLabels?: string[];
  columnLabels?: string[];
  compact?: boolean;
};

export function MatrixView({
  matrix,
  unit,
  transform = (value) => value,
  rowLabels,
  columnLabels,
  compact = false,
}: Props) {
  if (!matrix.length || !matrix[0]?.length) {
    return <div className="empty-matrix">Matriz vacía</div>;
  }

  return (
    <div className={`matrix-shell ${compact ? "compact" : ""}`}>
      {unit ? <span className="matrix-unit">Unidad: {unit}</span> : null}
      <div className="matrix-scroll" role="region" aria-label={`Matriz de ${matrix.length} por ${matrix[0].length}`} tabIndex={0}>
        <table className="matrix-table">
          <thead>
            <tr>
              <th aria-label="índice" />
              {matrix[0].map((_, column) => (
                <th key={column}>{columnLabels?.[column] ?? column + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th>{rowLabels?.[rowIndex] ?? rowIndex + 1}</th>
                {row.map((value, columnIndex) => (
                  <td key={columnIndex} title={String(transform(value))}>
                    {formatNumber(transform(value), compact ? 4 : 6)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

