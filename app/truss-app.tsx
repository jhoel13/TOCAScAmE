"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AnalysisResult,
  ElementAnalysis,
  TrussElement,
  TrussModel,
  TrussNode,
  analyzeTruss,
  deepCloneModel,
  formatNumber,
  validateModel,
} from "./truss-engine";
import { example1, example2, newModelTemplate } from "./truss-examples";

type Theme = "light" | "dark";
type AuthMode = "login" | "register";
type AppView = "Modelo" | "Procedimiento" | "Resultados" | "Teoría";
type LocalAccount = { name: string; email: string; passwordHash: string };
type PdfDocument = import("jspdf").jsPDF & { lastAutoTable?: { finalY: number } };

const views: AppView[] = ["Modelo", "Procedimiento", "Resultados", "Teoría"];
const accountKey = "tocascame.accounts.v1";
const sessionKey = "tocascame.session.v1";
const savedModelKey = "tocascame.model.v1";

function safeAnalyze(model: TrussModel): AnalysisResult | null {
  try {
    return analyzeTruss(model);
  } catch {
    return null;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Logo() {
  return (
    <div className="brand" aria-label="TOCAScAmE">
      <span className="brand-mark">T</span>
      <span className="brand-name">TOCAS<span>cAmE</span></span>
    </div>
  );
}

async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function matrixToRows(matrix: number[][], labels?: string[]): (string | number)[][] {
  const columnLabels = labels ?? matrix.map((_, index) => String(index + 1));
  return [
    ["", ...columnLabels],
    ...matrix.map((row, index) => [columnLabels[index] ?? String(index + 1), ...row]),
  ];
}

async function exportExcel(model: TrussModel, result: AnalysisResult) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const add = (name: string, rows: (string | number | boolean)[][]) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
  };

  add("Resumen", [
    ["TOCAScAmE – Informe de análisis matricial"],
    ["Proyecto", model.name],
    ["Descripción", model.description],
    ["Autor", "Jhoel Tocas Cercado"],
    ["Institución", "Universidad Nacional de Cajamarca"],
    ["Nodos", model.nodes.length],
    ["Barras", model.elements.length],
    ["GDL totales", model.nodes.length * 2],
    ["GDL libres", result.freeDofs.length],
    ["GDL restringidos", result.restrictedDofs.length],
    ["Desplazamiento máximo", result.maxDisplacement, model.lengthUnit],
    ["Fuerza axial máxima", result.maxAxialForce, model.forceUnit],
    ["Norma del residuo", result.residualNorm, model.forceUnit],
    ["Fuente", model.source],
  ]);
  add("Nodos", [
    ["Nodo", "x", "y", "Restringe X", "Restringe Y", "Fx", "Fy"],
    ...model.nodes.map((node) => [node.id, node.x, node.y, node.restraintX, node.restraintY, node.fx, node.fy]),
  ]);
  add("Barras", [
    ["Barra", "Nodo i", "Nodo j", "Área", "E", "Longitud", "cos θ", "sen θ"],
    ...model.elements.map((element, index) => [
      element.id, element.start, element.end, element.area, element.elasticModulus,
      result.elements[index].length, result.elements[index].cosine, result.elements[index].sine,
    ]),
  ]);
  add("GDL_Barras", [
    ["Barra", "Nodo i", "Nodo j", "GDL 1", "GDL 2", "GDL 3", "GDL 4"],
    ...result.elements.map((element) => [element.id, element.start, element.end, ...element.dofs.map((dof) => dof + 1)]),
  ]);
  add("Fuerzas_GDL", [
    ["GDL", "Etiqueta", "Fuerza aplicada", "Tipo"],
    ...result.forceVector.map((value, index) => [
      index + 1,
      result.dofLabels[index],
      value,
      result.restrictedDofs.includes(index) ? "Restringido" : "Libre",
    ]),
  ]);
  add("K_Global", matrixToRows(result.globalMatrix, result.dofLabels));
  add("K_Libre", matrixToRows(result.freeMatrix, result.freeDofs.map((dof) => result.dofLabels[dof])));
  add("Desplazamientos", [
    ["Nodo", "ux", "uy", "|u|", "Unidad"],
    ...model.nodes.map((node, index) => [
      node.id,
      result.displacements[index * 2],
      result.displacements[index * 2 + 1],
      Math.hypot(result.displacements[index * 2], result.displacements[index * 2 + 1]),
      model.lengthUnit,
    ]),
  ]);
  add("Reacciones", [
    ["Nodo", "Rx", "Ry", "Fx aplicada", "Fy aplicada", "Unidad"],
    ...model.nodes.map((node, index) => [
      node.id,
      result.reactions[index * 2],
      result.reactions[index * 2 + 1],
      node.fx,
      node.fy,
      model.forceUnit,
    ]),
  ]);
  add("Resultados_Barras", [
    ["Barra", "i", "j", "Longitud", "Elongación", "Deformación unitaria", "Esfuerzo", "Fuerza normal", "Comportamiento"],
    ...result.elements.map((element) => [
      element.id, element.start, element.end, element.length, element.extension,
      element.strain, element.stress, element.axialForce, element.behavior,
    ]),
  ]);
  add("K_Local_Elementos", [
    ["Barra", "Fila", "Columna", "Valor"],
    ...result.elements.flatMap((element) =>
      element.localMatrix.flatMap((row, rowIndex) =>
        row.map((value, columnIndex) => [element.id, rowIndex + 1, columnIndex + 1, value]),
      ),
    ),
  ]);
  add("K_Global_Elementos", [
    ["Barra", "Fila", "Columna", "Valor"],
    ...result.elements.flatMap((element) =>
      element.globalMatrix.flatMap((row, rowIndex) =>
        row.map((value, columnIndex) => [element.id, rowIndex + 1, columnIndex + 1, value]),
      ),
    ),
  ]);

  const filename = "TOCAScAmE_" + model.name.replace(/[^a-z0-9]+/gi, "_") + ".xlsx";
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

function drawModelInPdf(doc: PdfDocument, model: TrussModel, result: AnalysisResult, y: number) {
  const x0 = 18;
  const width = 260;
  const height = 78;
  const xs = model.nodes.map((node) => node.x);
  const ys = model.nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);
  const factor = Math.min((width - 20) / rangeX, (height - 18) / rangeY);
  const nodeMap = new Map(model.nodes.map((node) => [
    node.id,
    {
      x: x0 + 10 + (node.x - minX) * factor,
      y: y + height - 9 - (node.y - minY) * factor,
    },
  ]));

  doc.setFillColor(247, 249, 253);
  doc.roundedRect(x0, y, width, height, 3, 3, "F");
  model.elements.forEach((element, index) => {
    const a = nodeMap.get(element.start)!;
    const b = nodeMap.get(element.end)!;
    const behavior = result.elements[index].behavior;
    if (behavior === "Compresión") doc.setDrawColor(231, 120, 68);
    else if (behavior === "Tracción") doc.setDrawColor(44, 103, 220);
    else doc.setDrawColor(145, 155, 171);
    doc.setLineWidth(0.8);
    doc.line(a.x, a.y, b.x, b.y);
  });
  model.nodes.forEach((node) => {
    const p = nodeMap.get(node.id)!;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(32, 85, 190);
    doc.circle(p.x, p.y, 1.4, "FD");
    doc.setFontSize(6);
    doc.setTextColor(25, 35, 55);
    doc.text(node.id, p.x + 2, p.y - 2);
  });
  return y + height;
}

async function exportPdf(model: TrussModel, result: AnalysisResult) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const navy = [12, 29, 60] as [number, number, number];
  const blue = [36, 89, 218] as [number, number, number];
  const head = () => {
    doc.setFillColor(...navy);
    doc.rect(0, 0, 297, 16, "F");
    doc.setFillColor(...blue);
    doc.roundedRect(10, 4, 8, 8, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("T", 14, 10, { align: "center" });
    doc.text("TOCAScAmE", 22, 10);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("ANÁLISIS MATRICIAL DE ARMADURAS 2D", 287, 10, { align: "right" });
  };
  const title = (text: string, y = 25) => {
    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(text, 14, y);
  };
  const table = (options: Parameters<typeof autoTable>[1]) => autoTable(doc, {
    styles: { fontSize: 7, cellPadding: 1.5, lineColor: [225, 230, 239], lineWidth: 0.1 },
    headStyles: { fillColor: navy, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 249, 253] },
    margin: { left: 14, right: 14 },
    ...options,
  });

  head();
  doc.setTextColor(...navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(23);
  doc.text("Informe técnico de análisis", 14, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90, 102, 122);
  doc.text(model.name, 14, 40);
  doc.setFontSize(9);
  doc.text("Jhoel Tocas Cercado · Universidad Nacional de Cajamarca", 14, 47);
  drawModelInPdf(doc, model, result, 54);
  table({
    startY: 137,
    head: [["Indicador", "Resultado", "Unidad"]],
    body: [
      ["Nodos / barras", model.nodes.length + " / " + model.elements.length, "—"],
      ["GDL libres / restringidos", result.freeDofs.length + " / " + result.restrictedDofs.length, "—"],
      ["Desplazamiento máximo", formatNumber(result.maxDisplacement, 6), model.lengthUnit],
      ["Fuerza axial máxima", formatNumber(result.maxAxialForce, 6), model.forceUnit],
      ["Norma del residuo", formatNumber(result.residualNorm, 6), model.forceUnit],
    ],
    theme: "grid",
  });

  doc.addPage();
  head();
  title("1. Datos de entrada y grados de libertad");
  table({
    startY: 31,
    head: [["Nodo", "x", "y", "Rx", "Ry", "Fx", "Fy", "GDL x", "GDL y"]],
    body: model.nodes.map((node, index) => [
      node.id, formatNumber(node.x), formatNumber(node.y), node.restraintX ? "Sí" : "No",
      node.restraintY ? "Sí" : "No", formatNumber(node.fx), formatNumber(node.fy), index * 2 + 1, index * 2 + 2,
    ]),
  });

  doc.addPage();
  head();
  title("2. Barras, geometría y propiedades");
  table({
    startY: 31,
    head: [["Barra", "i", "j", "GDL", "L", "c", "s", "A", "E"]],
    body: model.elements.map((element, index) => [
      element.id, element.start, element.end,
      result.elements[index].dofs.map((dof) => dof + 1).join(", "),
      formatNumber(result.elements[index].length), formatNumber(result.elements[index].cosine),
      formatNumber(result.elements[index].sine), formatNumber(element.area), formatNumber(element.elasticModulus),
    ]),
  });

  doc.addPage();
  head();
  title("3. Ensamblaje del sistema");
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(70, 82, 102);
  doc.text("K · u = F. Se ensamblan las matrices globales de cada barra en sus GDL correspondientes.", 14, 38);
  doc.text("GDL restringidos: " + result.restrictedDofs.map((dof) => dof + 1).join(", "), 14, 45);
  doc.text("GDL libres: " + result.freeDofs.map((dof) => dof + 1).join(", "), 14, 51);
  const matrixLimit = Math.min(result.globalMatrix.length, 12);
  table({
    startY: 58,
    head: [["K global", ...result.dofLabels.slice(0, matrixLimit)]],
    body: result.globalMatrix.slice(0, matrixLimit).map((row, index) => [
      result.dofLabels[index], ...row.slice(0, matrixLimit).map((value) => formatNumber(value, 2)),
    ]),
    styles: { fontSize: 5.5, cellPadding: 1 },
  });
  if (result.globalMatrix.length > matrixLimit) {
    doc.setFontSize(7);
    doc.setTextColor(100, 110, 130);
    doc.text("Vista compacta 12×12. La matriz completa está incluida en el archivo Excel.", 14, 192);
  }

  doc.addPage();
  head();
  title("4. Desplazamientos y reacciones");
  table({
    startY: 31,
    head: [["Nodo", "ux", "uy", "|u|", "Rx", "Ry", "Fx", "Fy"]],
    body: model.nodes.map((node, index) => [
      node.id,
      formatNumber(result.displacements[index * 2], 7),
      formatNumber(result.displacements[index * 2 + 1], 7),
      formatNumber(Math.hypot(result.displacements[index * 2], result.displacements[index * 2 + 1]), 7),
      formatNumber(result.reactions[index * 2], 6),
      formatNumber(result.reactions[index * 2 + 1], 6),
      formatNumber(node.fx),
      formatNumber(node.fy),
    ]),
  });

  doc.addPage();
  head();
  title("5. Deformación, esfuerzo y fuerza normal");
  table({
    startY: 31,
    head: [["Barra", "i-j", "ΔL", "ε", "σ", "N", "Tipo"]],
    body: result.elements.map((element) => [
      element.id, element.start + "–" + element.end, formatNumber(element.extension, 7),
      formatNumber(element.strain, 7), formatNumber(element.stress, 6),
      formatNumber(element.axialForce, 6), element.behavior,
    ]),
  });

  result.elements.forEach((element, index) => {
    doc.addPage();
    head();
    title("Anexo · Matrices de " + element.id + " (" + element.start + "–" + element.end + ")");
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 92, 112);
    doc.text(
      "L = " + formatNumber(element.length) + " " + model.lengthUnit +
      "   ·   c = " + formatNumber(element.cosine) +
      "   ·   s = " + formatNumber(element.sine) +
      "   ·   GDL = [" + element.dofs.map((dof) => dof + 1).join(", ") + "]",
      14,
      38,
    );
    table({
      startY: 46,
      head: [["k local", "1", "2"]],
      body: element.localMatrix.map((row, rowIndex) => [rowIndex + 1, ...row.map((value) => formatNumber(value, 5))]),
      tableWidth: 105,
    });
    const firstEnd = (doc.lastAutoTable?.finalY ?? 80) + 9;
    table({
      startY: firstEnd,
      head: [["k global", "1", "2", "3", "4"]],
      body: element.globalMatrix.map((row, rowIndex) => [rowIndex + 1, ...row.map((value) => formatNumber(value, 5))]),
    });
    doc.setFontSize(7);
    doc.setTextColor(110, 120, 138);
    doc.text("Elemento " + (index + 1) + " de " + result.elements.length, 280, 194, { align: "right" });
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(120, 128, 144);
    doc.text("TOCAScAmE · Informe académico", 14, 204);
    doc.text("Página " + page + " de " + pages, 283, 204, { align: "right" });
  }
  const filename = "TOCAScAmE_" + model.name.replace(/[^a-z0-9]+/gi, "_") + ".pdf";
  downloadBlob(doc.output("blob"), filename);
}

function MatrixTable({ matrix, labels }: { matrix: number[][]; labels?: string[] }) {
  if (!matrix.length) return <p className="empty-state">Matriz vacía.</p>;
  const axis = labels ?? matrix.map((_, index) => String(index + 1));
  return (
    <div className="matrix-scroll">
      <table className="matrix-table">
        <thead>
          <tr><th /><th colSpan={matrix[0].length}>Columnas</th></tr>
          <tr><th>Fila</th>{matrix[0].map((_, index) => <th key={index}>{axis[index] ?? index + 1}</th>)}</tr>
        </thead>
        <tbody>
          {matrix.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <th>{axis[rowIndex] ?? rowIndex + 1}</th>
              {row.map((value, columnIndex) => <td key={columnIndex}>{formatNumber(value, 3)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrussDiagram({
  model,
  result,
  showDeformed,
  deformationScale,
  showGdl,
  showLabels,
}: {
  model: TrussModel;
  result: AnalysisResult | null;
  showDeformed: boolean;
  deformationScale: number;
  showGdl: boolean;
  showLabels: boolean;
}) {
  const width = 920;
  const height = 470;
  const padding = 62;
  const baseCoordinates = model.nodes.map((node, index) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    dx: result ? result.displacements[index * 2] * deformationScale : 0,
    dy: result ? result.displacements[index * 2 + 1] * deformationScale : 0,
  }));
  const allX = baseCoordinates.flatMap((node) => [node.x, node.x + (showDeformed ? node.dx : 0)]);
  const allY = baseCoordinates.flatMap((node) => [node.y, node.y + (showDeformed ? node.dy : 0)]);
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const factor = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offsetX = (width - spanX * factor) / 2;
  const offsetY = (height - spanY * factor) / 2;
  const point = (x: number, y: number) => ({
    x: offsetX + (x - minX) * factor,
    y: height - offsetY - (y - minY) * factor,
  });
  const original = new Map(baseCoordinates.map((node) => [node.id, point(node.x, node.y)]));
  const deformed = new Map(baseCoordinates.map((node) => [node.id, point(node.x + node.dx, node.y + node.dy)]));
  const resultById = new Map(result?.elements.map((element) => [element.id, element]) ?? []);
  const maxLoad = Math.max(1, ...model.nodes.map((node) => Math.hypot(node.fx, node.fy)));

  return (
    <svg id="tocascame-diagram" className="structure-canvas" viewBox={"0 0 " + width + " " + height} role="img" aria-label={"Modelo estructural de " + model.name}>
      <defs>
        <pattern id="engineering-grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M 28 0 L 0 0 0 28" className="grid-line" />
        </pattern>
        <marker id="load-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,4 L0,8 z" className="load-arrow-head" />
        </marker>
      </defs>
      <rect width={width} height={height} rx="18" className="diagram-background" />
      <rect width={width} height={height} rx="18" fill="url(#engineering-grid)" />
      <g className={showDeformed && result ? "original faded" : "original"}>
        {model.elements.map((element) => {
          const a = original.get(element.start)!;
          const b = original.get(element.end)!;
          return <line key={element.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="member-original" />;
        })}
      </g>
      {showDeformed && result && (
        <g className="deformed">
          {model.elements.map((element) => {
            const a = deformed.get(element.start)!;
            const b = deformed.get(element.end)!;
            const behavior = resultById.get(element.id)?.behavior ?? "Sin esfuerzo";
            const css = behavior === "Tracción" ? "tension" : behavior === "Compresión" ? "compression" : "zero";
            return <line key={element.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={"member-deformed " + css} />;
          })}
        </g>
      )}
      {model.elements.map((element) => {
        const coordinates = showDeformed && result ? deformed : original;
        const a = coordinates.get(element.start)!;
        const b = coordinates.get(element.end)!;
        return showLabels ? <text key={element.id} x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 5} className="element-label">{element.id}</text> : null;
      })}
      {model.nodes.map((node, index) => {
        const p = (showDeformed && result ? deformed : original).get(node.id)!;
        const base = original.get(node.id)!;
        const loadLength = 42 + 16 * Math.hypot(node.fx, node.fy) / maxLoad;
        const loadMagnitude = Math.hypot(node.fx, node.fy);
        const lx = loadMagnitude ? node.fx / loadMagnitude * loadLength : 0;
        const ly = loadMagnitude ? -node.fy / loadMagnitude * loadLength : 0;
        return (
          <g key={node.id}>
            {(node.restraintX || node.restraintY) && (
              <g className="support-symbol">
                <path d={"M " + (base.x - 12) + " " + (base.y + 22) + " L " + (base.x + 12) + " " + (base.y + 22) + " L " + base.x + " " + (base.y + 6) + " Z"} />
                {node.restraintY && !node.restraintX && <>
                  <circle cx={base.x - 6} cy={base.y + 26} r="3" />
                  <circle cx={base.x + 6} cy={base.y + 26} r="3" />
                </>}
                {node.restraintX && node.restraintY && <line x1={base.x - 16} y1={base.y + 25} x2={base.x + 16} y2={base.y + 25} />}
              </g>
            )}
            {loadMagnitude > 0 && (
              <line x1={base.x} y1={base.y} x2={base.x + lx} y2={base.y + ly} className="load-line" markerEnd="url(#load-arrow)" />
            )}
            <circle cx={p.x} cy={p.y} r="6.5" className="node-circle" />
            <text x={p.x + 9} y={p.y - 9} className="diagram-node-label">{node.id}</text>
            {showGdl && <text x={p.x + 9} y={p.y + 13} className="gdl-label">GDL {index * 2 + 1}, {index * 2 + 2}</text>}
          </g>
        );
      })}
      <g className="axis-glyph" transform="translate(35 410)">
        <line x1="0" y1="24" x2="38" y2="24" markerEnd="url(#load-arrow)" />
        <line x1="0" y1="24" x2="0" y2="-14" markerEnd="url(#load-arrow)" />
        <text x="44" y="28">x</text><text x="-5" y="-22">y</text>
      </g>
    </svg>
  );
}

function SummaryBadge({ result }: { result: AnalysisResult | null }) {
  return result
    ? <span className="status-pill success"><i /> Análisis resuelto</span>
    : <span className="status-pill pending"><i /> Modelo sin calcular</span>;
}

function ModelView({
  model,
  setModel,
  result,
  runAnalysis,
  saveModel,
}: {
  model: TrussModel;
  setModel: (model: TrussModel) => void;
  result: AnalysisResult | null;
  runAnalysis: () => void;
  saveModel: () => void;
}) {
  const [table, setTable] = useState<"nodes" | "elements">("nodes");
  const [showGdl, setShowGdl] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const validation = useMemo(() => validateModel(model), [model]);

  const updateNode = (index: number, patch: Partial<TrussNode>) => {
    const next = deepCloneModel(model);
    const previousId = next.nodes[index].id;
    next.nodes[index] = { ...next.nodes[index], ...patch };
    if (patch.id !== undefined && patch.id !== previousId) {
      next.elements = next.elements.map((element) => ({
        ...element,
        start: element.start === previousId ? patch.id! : element.start,
        end: element.end === previousId ? patch.id! : element.end,
      }));
    }
    setModel(next);
  };
  const updateElement = (index: number, patch: Partial<TrussElement>) => {
    const next = deepCloneModel(model);
    next.elements[index] = { ...next.elements[index], ...patch };
    setModel(next);
  };
  const addNode = () => {
    const next = deepCloneModel(model);
    let counter = next.nodes.length + 1;
    let id = "N" + counter;
    while (next.nodes.some((node) => node.id === id)) { counter += 1; id = "N" + counter; }
    next.nodes.push({ id, x: 0, y: 0, restraintX: false, restraintY: false, fx: 0, fy: 0 });
    setModel(next);
  };
  const removeNode = (index: number) => {
    const id = model.nodes[index].id;
    if (!window.confirm("Se eliminará el nodo " + id + " y todas las barras conectadas. ¿Continuar?")) return;
    const next = deepCloneModel(model);
    next.nodes.splice(index, 1);
    next.elements = next.elements.filter((element) => element.start !== id && element.end !== id);
    setModel(next);
  };
  const addElement = () => {
    if (model.nodes.length < 2) return;
    const next = deepCloneModel(model);
    let counter = next.elements.length + 1;
    let id = "B" + counter;
    while (next.elements.some((element) => element.id === id)) { counter += 1; id = "B" + counter; }
    const reference = next.elements[0];
    next.elements.push({
      id,
      start: next.nodes[0].id,
      end: next.nodes[1].id,
      area: reference?.area ?? 25,
      elasticModulus: reference?.elasticModulus ?? 2e6,
    });
    setModel(next);
  };
  const applyUniform = (field: "area" | "elasticModulus", value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    const next = deepCloneModel(model);
    next.elements = next.elements.map((element) => ({ ...element, [field]: value }));
    setModel(next);
  };

  return (
    <>
      <div className="model-layout">
        <article className="panel diagram-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">GEOMETRÍA ACTIVA</p><h2>{model.name}</h2><p>{model.description}</p></div>
            <div className="view-toggles">
              <label className="mini-check"><input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} /> Barras</label>
              <label className="mini-check"><input type="checkbox" checked={showGdl} onChange={(event) => setShowGdl(event.target.checked)} /> GDL</label>
            </div>
          </div>
          <TrussDiagram model={model} result={result} showDeformed={false} deformationScale={1} showGdl={showGdl} showLabels={showLabels} />
          <div className="model-stats">
            <div><span>Nodos</span><strong>{model.nodes.length}</strong></div>
            <div><span>Barras</span><strong>{model.elements.length}</strong></div>
            <div><span>GDL</span><strong>{model.nodes.length * 2}</strong></div>
            <div><span>Restricciones</span><strong>{model.nodes.reduce((sum, node) => sum + Number(node.restraintX) + Number(node.restraintY), 0)}</strong></div>
          </div>
        </article>

        <aside className="panel properties-panel">
          <div className="panel-heading compact"><div><p className="eyebrow">PROPIEDADES</p><h2>Datos generales</h2></div></div>
          <label className="field-label">Nombre del proyecto<input value={model.name} onChange={(event) => setModel({ ...model, name: event.target.value })} /></label>
          <div className="two-fields">
            <label className="field-label">Longitud<input value={model.lengthUnit} onChange={(event) => setModel({ ...model, lengthUnit: event.target.value })} /></label>
            <label className="field-label">Fuerza<input value={model.forceUnit} onChange={(event) => setModel({ ...model, forceUnit: event.target.value })} /></label>
          </div>
          <label className="field-label">Área uniforme
            <input type="number" defaultValue={model.elements[0]?.area ?? 25} onBlur={(event) => applyUniform("area", Number(event.target.value))} />
          </label>
          <label className="field-label">Módulo E uniforme
            <input type="number" defaultValue={model.elements[0]?.elasticModulus ?? 2e6} onBlur={(event) => applyUniform("elasticModulus", Number(event.target.value))} />
          </label>
          <div className={"validation-box " + (validation.valid ? "valid" : "invalid")}>
            <i>{validation.valid ? "✓" : "!"}</i>
            <div>
              <strong>{validation.valid ? "Modelo consistente" : "Revisa el modelo"}</strong>
              <span>{validation.valid ? (validation.warnings[0] ?? "Listo para ejecutar el análisis") : validation.errors[0]}</span>
            </div>
          </div>
          <button className="primary-button" onClick={runAnalysis} disabled={!validation.valid}>Calcular estructura <span>→</span></button>
          <button className="secondary-button wide" onClick={saveModel}>Guardar en este dispositivo</button>
        </aside>
      </div>

      <section className="panel editor-panel">
        <div className="editor-toolbar">
          <div className="segmented-control">
            <button className={table === "nodes" ? "active" : ""} onClick={() => setTable("nodes")}>Nodos y cargas</button>
            <button className={table === "elements" ? "active" : ""} onClick={() => setTable("elements")}>Barras y propiedades</button>
          </div>
          <button className="small-primary" onClick={table === "nodes" ? addNode : addElement}>+ Agregar {table === "nodes" ? "nodo" : "barra"}</button>
        </div>
        {table === "nodes" ? (
          <div className="data-scroll">
            <table className="data-table editable-table">
              <thead><tr><th>Nodo</th><th>x ({model.lengthUnit})</th><th>y ({model.lengthUnit})</th><th>Rx</th><th>Ry</th><th>Fx ({model.forceUnit})</th><th>Fy ({model.forceUnit})</th><th /></tr></thead>
              <tbody>
                {model.nodes.map((node, index) => (
                  <tr key={index}>
                    <td><input aria-label={"Identificador del nodo " + (index + 1)} value={node.id} onChange={(event) => updateNode(index, { id: event.target.value })} /></td>
                    <td><input aria-label={"Coordenada x de " + node.id} type="number" value={node.x} onChange={(event) => updateNode(index, { x: Number(event.target.value) })} /></td>
                    <td><input aria-label={"Coordenada y de " + node.id} type="number" value={node.y} onChange={(event) => updateNode(index, { y: Number(event.target.value) })} /></td>
                    <td><input aria-label={"Restricción x de " + node.id} type="checkbox" checked={node.restraintX} onChange={(event) => updateNode(index, { restraintX: event.target.checked })} /></td>
                    <td><input aria-label={"Restricción y de " + node.id} type="checkbox" checked={node.restraintY} onChange={(event) => updateNode(index, { restraintY: event.target.checked })} /></td>
                    <td><input aria-label={"Carga Fx de " + node.id} type="number" value={node.fx} onChange={(event) => updateNode(index, { fx: Number(event.target.value) })} /></td>
                    <td><input aria-label={"Carga Fy de " + node.id} type="number" value={node.fy} onChange={(event) => updateNode(index, { fy: Number(event.target.value) })} /></td>
                    <td><button className="delete-row" onClick={() => removeNode(index)} aria-label={"Eliminar nodo " + node.id}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="data-scroll">
            <table className="data-table editable-table">
              <thead><tr><th>Barra</th><th>Nodo i</th><th>Nodo j</th><th>Área</th><th>E</th><th /></tr></thead>
              <tbody>
                {model.elements.map((element, index) => (
                  <tr key={index}>
                    <td><input aria-label={"Identificador de barra " + (index + 1)} value={element.id} onChange={(event) => updateElement(index, { id: event.target.value })} /></td>
                    <td><select aria-label={"Nodo inicial de " + element.id} value={element.start} onChange={(event) => updateElement(index, { start: event.target.value })}>{model.nodes.map((node) => <option key={node.id}>{node.id}</option>)}</select></td>
                    <td><select aria-label={"Nodo final de " + element.id} value={element.end} onChange={(event) => updateElement(index, { end: event.target.value })}>{model.nodes.map((node) => <option key={node.id}>{node.id}</option>)}</select></td>
                    <td><input aria-label={"Área de " + element.id} type="number" value={element.area} min="0" onChange={(event) => updateElement(index, { area: Number(event.target.value) })} /></td>
                    <td><input aria-label={"Módulo E de " + element.id} type="number" value={element.elasticModulus} min="0" onChange={(event) => updateElement(index, { elasticModulus: Number(event.target.value) })} /></td>
                    <td><button className="delete-row" onClick={() => {
                      const next = deepCloneModel(model);
                      next.elements.splice(index, 1);
                      setModel(next);
                    }} aria-label={"Eliminar barra " + element.id}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function ProcedureView({ model, result }: { model: TrussModel; result: AnalysisResult }) {
  const [selectedId, setSelectedId] = useState(result.elements[0]?.id ?? "");
  const selected = result.elements.find((element) => element.id === selectedId) ?? result.elements[0];
  return (
    <div className="procedure-stack">
      <section className="procedure-intro panel">
        <div><p className="eyebrow">RUTA DE CÁLCULO</p><h2>Procedimiento matricial completo</h2><p>Cada resultado está vinculado con los datos del modelo activo. Los GDL se muestran con numeración académica desde 1.</p></div>
        <div className="equation-card"><span>ECUACIÓN DEL SISTEMA</span><strong>[K]<sub>global</sub> {"{"}u{"}"} = {"{"}F{"}"}</strong><small>con u<sub>restringidos</sub> = 0</small></div>
      </section>

      <section className="step-card panel">
        <div className="step-number">01</div>
        <div className="step-body">
          <div className="step-heading"><div><h2>Geometría y GDL de cada barra</h2><p>Se calculan L, cos θ, sen θ y el vector de posicionamiento.</p></div></div>
          <div className="data-scroll"><table className="data-table">
            <thead><tr><th>Barra</th><th>Nodos</th><th>L ({model.lengthUnit})</th><th>c</th><th>s</th><th>GDL</th></tr></thead>
            <tbody>{result.elements.map((element) => <tr key={element.id}><td><strong>{element.id}</strong></td><td>{element.start}–{element.end}</td><td>{formatNumber(element.length)}</td><td>{formatNumber(element.cosine)}</td><td>{formatNumber(element.sine)}</td><td><code>[{element.dofs.map((dof) => dof + 1).join(", ")}]</code></td></tr>)}</tbody>
          </table></div>
        </div>
      </section>

      <section className="step-card panel">
        <div className="step-number">02</div>
        <div className="step-body">
          <div className="step-heading"><div><h2>Matrices local y global de cada elemento</h2><p>k<sub>local</sub> = AE/L [1 −1; −1 1] y k<sub>global</sub> = Tᵀ k<sub>local</sub> T.</p></div>
            <label className="inline-select">Barra<select value={selected?.id} onChange={(event) => setSelectedId(event.target.value)}>{result.elements.map((element) => <option key={element.id}>{element.id}</option>)}</select></label>
          </div>
          {selected && <div className="three-matrices">
            <div><h3>k local · {selected.id}</h3><MatrixTable matrix={selected.localMatrix} /></div>
            <div><h3>Matriz T</h3><MatrixTable matrix={selected.transformation} /></div>
            <div><h3>k global · {selected.id}</h3><MatrixTable matrix={selected.globalMatrix} /></div>
          </div>}
        </div>
      </section>

      <section className="step-card panel">
        <div className="step-number">03</div>
        <div className="step-body">
          <h2>Restricciones y vector de fuerzas</h2>
          <p className="step-copy">GDL restringidos: <code>[{result.restrictedDofs.map((dof) => dof + 1).join(", ")}]</code> · GDL libres: <code>[{result.freeDofs.map((dof) => dof + 1).join(", ")}]</code></p>
          <div className="vector-grid">
            <div><h3>Vector F global</h3><div className="vector-list">{result.forceVector.map((value, index) => <div key={index}><span>{index + 1} · {result.dofLabels[index]}</span><strong>{formatNumber(value)}</strong></div>)}</div></div>
            <div><h3>GDL con carga distinta de cero</h3><div className="loaded-dofs">{result.loadedDofs.length ? result.loadedDofs.map((dof) => <span key={dof}>{dof + 1} · {result.dofLabels[dof]} = {formatNumber(result.forceVector[dof])} {model.forceUnit}</span>) : <span>Sin cargas aplicadas</span>}</div></div>
          </div>
        </div>
      </section>

      <section className="step-card panel">
        <div className="step-number">04</div>
        <div className="step-body"><h2>Ensamblaje de la matriz de rigidez global</h2><p className="step-copy">Dimensión: {result.globalMatrix.length} × {result.globalMatrix.length}. Cada k<sub>global</sub> se suma en las posiciones indicadas por los GDL de su barra.</p><MatrixTable matrix={result.globalMatrix} labels={result.dofLabels} /></div>
      </section>

      <section className="step-card panel">
        <div className="step-number">05</div>
        <div className="step-body"><h2>Sistema reducido en GDL libres</h2><p className="step-copy">Se extrae K<sub>ff</sub> y se resuelve K<sub>ff</sub>u<sub>f</sub> = F<sub>f</sub> mediante eliminación gaussiana con pivoteo parcial.</p><MatrixTable matrix={result.freeMatrix} labels={result.freeDofs.map((dof) => result.dofLabels[dof])} /></div>
      </section>

      <section className="step-card panel">
        <div className="step-number">06</div>
        <div className="step-body">
          <h2>Desplazamientos y reacciones</h2>
          <p className="step-copy">Se reconstruye el vector u completo y se obtiene R = Ku − F. La norma del residuo en GDL libres es {formatNumber(result.residualNorm, 6)} {model.forceUnit}.</p>
          <div className="data-scroll"><table className="data-table">
            <thead><tr><th>Nodo</th><th>ux</th><th>uy</th><th>Rx</th><th>Ry</th></tr></thead>
            <tbody>{model.nodes.map((node, index) => <tr key={node.id}><td><strong>{node.id}</strong></td><td>{formatNumber(result.displacements[index * 2], 7)}</td><td>{formatNumber(result.displacements[index * 2 + 1], 7)}</td><td>{formatNumber(result.reactions[index * 2], 6)}</td><td>{formatNumber(result.reactions[index * 2 + 1], 6)}</td></tr>)}</tbody>
          </table></div>
        </div>
      </section>

      <section className="step-card panel">
        <div className="step-number">07</div>
        <div className="step-body"><h2>Deformación, esfuerzo y fuerza normal</h2><p className="step-copy">ε = ΔL/L · σ = Eε · N = Aσ. N &gt; 0 indica tracción y N &lt; 0 indica compresión.</p>
          <div className="data-scroll"><table className="data-table">
            <thead><tr><th>Barra</th><th>ΔL</th><th>ε</th><th>σ</th><th>N</th><th>Tipo</th></tr></thead>
            <tbody>{result.elements.map((element) => <tr key={element.id}><td><strong>{element.id}</strong></td><td>{formatNumber(element.extension, 7)}</td><td>{formatNumber(element.strain, 7)}</td><td>{formatNumber(element.stress, 6)}</td><td>{formatNumber(element.axialForce, 6)}</td><td><span className={"behavior " + (element.behavior === "Tracción" ? "tension" : element.behavior === "Compresión" ? "compression" : "zero")}>{element.behavior}</span></td></tr>)}</tbody>
          </table></div>
        </div>
      </section>
    </div>
  );
}

function ResultsView({ model, result }: { model: TrussModel; result: AnalysisResult }) {
  const [scale, setScale] = useState(() => {
    const xs = model.nodes.map((node) => node.x);
    const ys = model.nodes.map((node) => node.y);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
    return result.maxDisplacement > 0 ? Math.max(1, Math.round((span * 0.12) / result.maxDisplacement)) : 1;
  });
  const [filter, setFilter] = useState<"Todos" | ElementAnalysis["behavior"]>("Todos");
  const visibleElements = result.elements.filter((element) => filter === "Todos" || element.behavior === filter);
  const tensionCount = result.elements.filter((element) => element.behavior === "Tracción").length;
  const compressionCount = result.elements.filter((element) => element.behavior === "Compresión").length;

  return (
    <div className="results-stack">
      <section className="result-metrics">
        <article className="metric panel"><span>Desplazamiento máximo</span><strong>{formatNumber(result.maxDisplacement, 6)}</strong><small>{model.lengthUnit}</small></article>
        <article className="metric panel"><span>Fuerza normal máxima</span><strong>{formatNumber(result.maxAxialForce, 5)}</strong><small>{model.forceUnit}</small></article>
        <article className="metric panel"><span>Barras a tracción</span><strong>{tensionCount}</strong><small>de {result.elements.length}</small></article>
        <article className="metric panel"><span>Barras a compresión</span><strong>{compressionCount}</strong><small>de {result.elements.length}</small></article>
      </section>
      <section className="panel deformation-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">FORMA DEFORMADA</p><h2>Original vs. deformada</h2><p>Azul: tracción · Naranja: compresión · Gris: esfuerzo despreciable.</p></div>
          <label className="scale-control">Escala de deformación<input type="number" min="0" value={scale} onChange={(event) => setScale(Math.max(0, Number(event.target.value)))} /><span>×</span></label>
        </div>
        <TrussDiagram model={model} result={result} showDeformed deformationScale={scale} showGdl={false} showLabels />
        <div className="diagram-legend"><span><i className="original" />Original</span><span><i className="tension" />Tracción</span><span><i className="compression" />Compresión</span><span><i className="load" />Carga</span></div>
      </section>
      <section className="panel results-table-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">RESULTADOS NODALES</p><h2>Desplazamientos y reacciones</h2></div>
          <div className="export-actions"><button className="excel-button" onClick={() => exportExcel(model, result)}>Descargar Excel</button><button className="pdf-button" onClick={() => exportPdf(model, result)}>Descargar PDF</button></div>
        </div>
        <div className="data-scroll"><table className="data-table">
          <thead><tr><th>Nodo</th><th>ux ({model.lengthUnit})</th><th>uy ({model.lengthUnit})</th><th>|u|</th><th>Fx aplicada</th><th>Fy aplicada</th><th>Rx</th><th>Ry</th></tr></thead>
          <tbody>{model.nodes.map((node, index) => <tr key={node.id}><td><strong>{node.id}</strong></td><td>{formatNumber(result.displacements[index * 2], 7)}</td><td>{formatNumber(result.displacements[index * 2 + 1], 7)}</td><td>{formatNumber(Math.hypot(result.displacements[index * 2], result.displacements[index * 2 + 1]), 7)}</td><td>{formatNumber(node.fx)}</td><td>{formatNumber(node.fy)}</td><td>{formatNumber(result.reactions[index * 2], 6)}</td><td>{formatNumber(result.reactions[index * 2 + 1], 6)}</td></tr>)}</tbody>
        </table></div>
      </section>
      <section className="panel results-table-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">RESULTADOS POR BARRA</p><h2>Esfuerzo axial y tipo de deformación</h2></div>
          <div className="filter-row">{(["Todos", "Tracción", "Compresión", "Sin esfuerzo"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
        </div>
        <div className="data-scroll"><table className="data-table">
          <thead><tr><th>Barra</th><th>Nodos</th><th>L</th><th>ΔL</th><th>ε</th><th>σ ({model.forceUnit}/{model.lengthUnit}²)</th><th>N ({model.forceUnit})</th><th>Tipo</th></tr></thead>
          <tbody>{visibleElements.map((element) => <tr key={element.id}><td><strong>{element.id}</strong></td><td>{element.start}–{element.end}</td><td>{formatNumber(element.length)}</td><td>{formatNumber(element.extension, 7)}</td><td>{formatNumber(element.strain, 7)}</td><td>{formatNumber(element.stress, 6)}</td><td>{formatNumber(element.axialForce, 6)}</td><td><span className={"behavior " + (element.behavior === "Tracción" ? "tension" : element.behavior === "Compresión" ? "compression" : "zero")}>{element.behavior}</span></td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
  );
}

function TheoryView() {
  const [open, setOpen] = useState("fundamentos");
  const sections = [
    {
      id: "fundamentos",
      title: "Fundamentos de una armadura plana",
      content: <>
        <p>Una armadura 2D idealiza barras rectas conectadas mediante nudos articulados. Cada barra trabaja únicamente a fuerza axial: tracción o compresión. El modelo matricial relaciona fuerzas nodales y desplazamientos mediante la rigidez.</p>
        <div className="theory-grid"><div><strong>Hipótesis principales</strong><ul><li>Material elástico lineal: σ = Eε.</li><li>Deformaciones y desplazamientos pequeños.</li><li>Cargas aplicadas en los nodos.</li><li>Uniones idealmente articuladas.</li><li>Área A y módulo E constantes por barra.</li></ul></div><div><strong>Lo que no representa</strong><ul><li>Flexión ni cortante en las barras.</li><li>Plasticidad o fisuración.</li><li>Pandeo no lineal.</li><li>Grandes desplazamientos.</li><li>Cargas distribuidas directas sobre barras.</li></ul></div></div>
      </>,
    },
    {
      id: "gdl",
      title: "Grados de libertad y restricciones",
      content: <><p>Cada nodo posee dos grados de libertad: desplazamiento horizontal u<sub>x</sub> y vertical u<sub>y</sub>. Para el nodo n, esta aplicación asigna los GDL 2n−1 y 2n. Un apoyo articulado restringe x e y; un rodillo horizontal restringe y.</p><div className="formula-box">Nodo i → [u<sub>ix</sub>, u<sub>iy</sub>] · Barra i–j → [u<sub>ix</sub>, u<sub>iy</sub>, u<sub>jx</sub>, u<sub>jy</sub>]</div></>,
    },
    {
      id: "elemento",
      title: "Rigidez de un elemento",
      content: <><p>Para una barra de longitud L, área A y módulo de elasticidad E, su rigidez axial es AE/L. La matriz local actúa en el eje de la barra y la transformación usa c = Δx/L y s = Δy/L.</p><div className="formula-box">k<sub>local</sub> = AE/L · [ 1 −1 ; −1 1 ]</div><div className="formula-box">T = [ c s 0 0 ; 0 0 c s ] · k<sub>global</sub> = Tᵀ k<sub>local</sub> T</div></>,
    },
    {
      id: "ensamblaje",
      title: "Ensamblaje y solución",
      content: <><p>Las matrices de cada elemento se suman en una matriz K del sistema según sus GDL. Luego se separan GDL libres y restringidos. Con desplazamientos prescritos iguales a cero, se resuelve K<sub>ff</sub>u<sub>f</sub> = F<sub>f</sub>.</p><ol className="workflow-list"><li>Numerar nodos y GDL.</li><li>Calcular cada k local y global.</li><li>Ensamblar K global.</li><li>Construir F global.</li><li>Aplicar restricciones.</li><li>Resolver desplazamientos.</li><li>Calcular reacciones y fuerzas internas.</li></ol></>,
    },
    {
      id: "resultados",
      title: "Deformación, esfuerzo y fuerza normal",
      content: <><p>La elongación axial de una barra se obtiene proyectando los desplazamientos nodales sobre su eje. La deformación unitaria es ε = ΔL/L, el esfuerzo es σ = Eε y la fuerza normal N = Aσ.</p><div className="sign-convention"><div><i className="tension" /><strong>N positivo · Tracción</strong><span>La barra se alarga.</span></div><div><i className="compression" /><strong>N negativo · Compresión</strong><span>La barra se acorta.</span></div></div></>,
    },
    {
      id: "control",
      title: "Controles de calidad del modelo",
      content: <><p>Una matriz singular indica un mecanismo o una estructura inestable. Revisa que exista conectividad, que no haya barras de longitud cero, que A y E sean positivos y que los apoyos eliminen los movimientos rígidos.</p><ul><li>Equilibrio: la suma de cargas y reacciones debe ser aproximadamente cero.</li><li>Simetría: K debe ser simétrica.</li><li>Compatibilidad: las barras conectadas comparten desplazamientos nodales.</li><li>Unidades: usa un sistema coherente para coordenadas, A, E y fuerzas.</li><li>Residuo: Ku−F debe ser casi cero en GDL libres.</li></ul></>,
    },
  ];
  return (
    <div className="theory-layout">
      <aside className="panel theory-index"><p className="eyebrow">CONTENIDO</p>{sections.map((section, index) => <button key={section.id} className={open === section.id ? "active" : ""} onClick={() => setOpen(section.id)}><span>{String(index + 1).padStart(2, "0")}</span>{section.title}</button>)}</aside>
      <section className="panel theory-content">
        <p className="eyebrow">BASE TEÓRICA</p>
        <h1>{sections.find((section) => section.id === open)?.title}</h1>
        <div>{sections.find((section) => section.id === open)?.content}</div>
        <div className="reference-note"><strong>Referencia académica</strong><p>Procedimiento adaptado de los notebooks Example 1 y Example 2 proporcionados, y de la formulación clásica del método matricial de la rigidez para armaduras planas.</p></div>
      </section>
    </div>
  );
}

export default function TrussApp() {
  const [theme, setTheme] = useState<Theme>("light");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authenticated, setAuthenticated] = useState(false);
  const [userName, setUserName] = useState("Jhoel Tocas");
  const [name, setName] = useState("Jhoel Tocas Cercado");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [active, setActive] = useState<AppView>("Modelo");
  const [caseId, setCaseId] = useState<"example1" | "example2" | "new">("example1");
  const [model, setModelState] = useState<TrussModel>(() => deepCloneModel(example1));
  const [result, setResult] = useState<AnalysisResult | null>(() => safeAnalyze(example1));
  const [analysisError, setAnalysisError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const storedTheme = localStorage.getItem("tocascame.theme") as Theme | null;
    const session = sessionStorage.getItem(sessionKey);
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (storedTheme === "dark" || storedTheme === "light") setTheme(storedTheme);
      if (session) {
        try {
          const parsed = JSON.parse(session) as { name: string };
          setUserName(parsed.name);
          setAuthenticated(true);
        } catch { /* sesión no válida */ }
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("tocascame.theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const validation = useMemo(() => validateModel(model), [model]);

  const setModel = (next: TrussModel) => {
    setModelState(next);
    setResult(null);
    setAnalysisError("");
  };

  const loadCase = (id: "example1" | "example2" | "new") => {
    const selected = id === "example1" ? example1 : id === "example2" ? example2 : newModelTemplate;
    const next = deepCloneModel(selected);
    setCaseId(id);
    setModelState(next);
    setResult(safeAnalyze(next));
    setAnalysisError("");
    setActive("Modelo");
  };

  const runAnalysis = () => {
    try {
      const next = analyzeTruss(model);
      setResult(next);
      setAnalysisError("");
      setActive("Resultados");
      setToast("Análisis completado correctamente.");
    } catch (error) {
      setResult(null);
      setAnalysisError(error instanceof Error ? error.message : "No fue posible resolver el modelo.");
      setToast("El modelo necesita una corrección.");
    }
  };

  const saveModel = () => {
    localStorage.setItem(savedModelKey, JSON.stringify(model));
    setToast("Proyecto guardado en este dispositivo.");
  };

  const restoreModel = () => {
    const stored = localStorage.getItem(savedModelKey);
    if (!stored) { setToast("Todavía no existe un proyecto guardado."); return; }
    try {
      const restored = JSON.parse(stored) as TrussModel;
      setModelState(restored);
      setResult(safeAnalyze(restored));
      setCaseId("new");
      setActive("Modelo");
      setToast("Proyecto recuperado.");
    } catch {
      setToast("No se pudo recuperar el proyecto guardado.");
    }
  };

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    if (password.length < 6) { setAuthError("La contraseña debe tener al menos 6 caracteres."); return; }
    const accounts = JSON.parse(localStorage.getItem(accountKey) || "[]") as LocalAccount[];
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await hashPassword(password);
    if (authMode === "register") {
      if (accounts.some((account) => account.email === normalizedEmail)) { setAuthError("Ese correo ya está registrado en este dispositivo."); return; }
      const account = { name: name.trim() || "Usuario TOCAScAmE", email: normalizedEmail, passwordHash };
      accounts.push(account);
      localStorage.setItem(accountKey, JSON.stringify(accounts));
      sessionStorage.setItem(sessionKey, JSON.stringify({ name: account.name, email: account.email }));
      setUserName(account.name);
      setAuthenticated(true);
      return;
    }
    const account = accounts.find((item) => item.email === normalizedEmail && item.passwordHash === passwordHash);
    if (!account) { setAuthError("Correo o contraseña incorrectos. Puedes registrarte o explorar como invitado."); return; }
    sessionStorage.setItem(sessionKey, JSON.stringify({ name: account.name, email: account.email }));
    setUserName(account.name);
    setAuthenticated(true);
  }

  const enterGuest = () => {
    setUserName("Jhoel Tocas");
    sessionStorage.setItem(sessionKey, JSON.stringify({ name: "Jhoel Tocas", email: "" }));
    setAuthenticated(true);
  };

  const logout = () => {
    sessionStorage.removeItem(sessionKey);
    setAuthenticated(false);
    setPassword("");
  };

  if (!authenticated) {
    return (
      <main className="auth-shell">
        <section className="auth-story">
          <div className="auth-story-inner">
            <Logo />
            <p className="eyebrow light">INGENIERÍA ESTRUCTURAL · UNC</p>
            <h1>Del modelo a la respuesta, <em>sin saltarse ningún paso.</em></h1>
            <p className="auth-lead">Análisis matricial completo de armaduras planas 2D, diseñado para estudiar, comprobar y presentar resultados con claridad.</p>
            <div className="story-metrics"><div><strong>2</strong><span>ejemplos precargados</span></div><div><strong>100%</strong><span>procedimiento visible</span></div><div><strong>PDF + XLSX</strong><span>reportes descargables</span></div></div>
            <TrussDiagram model={example1} result={safeAnalyze(example1)} showDeformed={false} deformationScale={1} showGdl={false} showLabels={false} />
            <p className="author-line">Desarrollado para Jhoel Tocas Cercado · Universidad Nacional de Cajamarca</p>
          </div>
        </section>
        <section className="auth-panel">
          <button className="theme-button floating" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Cambiar tema">{theme === "light" ? "☾" : "☀"}</button>
          <div className="auth-card">
            <div className="mobile-brand"><Logo /></div>
            <p className="eyebrow">ACCESO AL LABORATORIO</p>
            <h2>{authMode === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta"}</h2>
            <p className="muted">{authMode === "login" ? "Ingresa para continuar tu análisis." : "Regístrate con tu correo académico."}</p>
            <div className="auth-switch" role="tablist">
              <button className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setAuthError(""); }}>Ingresar</button>
              <button className={authMode === "register" ? "active" : ""} onClick={() => { setAuthMode("register"); setAuthError(""); }}>Registrarse</button>
            </div>
            <form onSubmit={submitAuth}>
              {authMode === "register" && <label className="field-label">Nombre completo<input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Jhoel Tocas Cercado" required /></label>}
              <label className="field-label">Correo electrónico<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@unc.edu.pe" required /></label>
              <label className="field-label">Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 6 caracteres" minLength={6} required /></label>
              {authError && <p className="form-error">{authError}</p>}
              <button className="primary-button" type="submit">{authMode === "login" ? "Ingresar a TOCAScAmE" : "Crear cuenta y continuar"}<span>→</span></button>
            </form>
            <button className="guest-button" onClick={enterGuest}>Explorar como invitado</button>
            <p className="privacy-note">Versión académica: la cuenta y los proyectos se guardan únicamente en este dispositivo.</p>
          </div>
        </section>
      </main>
    );
  }

  const pageTitle = active === "Modelo" ? "Define la armadura" : active === "Procedimiento" ? "Comprueba cada paso" : active === "Resultados" ? "Interpreta la respuesta" : "Aprende el método";
  const pageCopy = active === "Modelo" ? "Edita geometría, propiedades, apoyos y cargas." : active === "Procedimiento" ? "Matrices, GDL, ensamblaje y solución del sistema." : active === "Resultados" ? "Desplazamientos, reacciones, deformada y fuerzas normales." : "Fundamentos, ecuaciones, hipótesis y controles de calidad.";

  return (
    <main className="app-shell">
      {toast && <div className="toast" role="status">{toast}</div>}
      <header className="topbar">
        <Logo />
        <nav aria-label="Navegación principal">{views.map((item) => <button key={item} className={active === item ? "active" : ""} onClick={() => {
          if ((item === "Procedimiento" || item === "Resultados") && !result) { setToast("Calcula primero la estructura."); return; }
          setActive(item);
        }}>{item}</button>)}</nav>
        <div className="top-actions">
          <SummaryBadge result={result} />
          <button className="theme-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Cambiar tema">{theme === "light" ? "☾" : "☀"}</button>
          <button className="avatar" onClick={logout} title="Cerrar sesión">{userName.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <p className="sidebar-label">CASO DE ESTUDIO</p>
          <div className="example-picker">
            <button className={caseId === "example1" ? "active" : ""} onClick={() => loadCase("example1")}><span>1</span>Ejemplo 1<small>9 barras · 6 nodos</small></button>
            <button className={caseId === "example2" ? "active" : ""} onClick={() => loadCase("example2")}><span>2</span>Ejemplo 2<small>58 barras · 28 nodos</small></button>
            <button className={caseId === "new" ? "active" : ""} onClick={() => loadCase("new")}><span>+</span>Nuevo modelo<small>Plantilla editable</small></button>
          </div>
          <button className="restore-button" onClick={restoreModel}>↻ Recuperar guardado</button>
          <div className="sidebar-progress">
            <p className="sidebar-label">PROCEDIMIENTO</p>
            {["Datos y geometría", "Matrices de elementos", "Ensamblaje global", "Sistema reducido", "Resultados"].map((step, index) => <div key={step} className={result ? "done" : index === 0 ? "current" : ""}><span>{result ? "✓" : index + 1}</span>{step}</div>)}
          </div>
          <div className="sidebar-note"><span>UNC</span><p><strong>Jhoel Tocas Cercado</strong>Ingeniería Hidráulica</p></div>
        </aside>

        <div className="content">
          <div className="page-heading">
            <div><p className="eyebrow">PROYECTO ACTIVO / {model.name.toUpperCase()}</p><h1>{pageTitle}</h1><p>{pageCopy}</p></div>
            <div className="heading-actions">
              {active === "Modelo" && <><button className="secondary-button" onClick={saveModel}>Guardar</button><button className="primary-button compact" onClick={runAnalysis} disabled={!validation.valid}>Calcular estructura <span>→</span></button></>}
              {(active === "Procedimiento" || active === "Resultados") && result && <><button className="excel-button heading-export" onClick={() => exportExcel(model, result)}>Excel</button><button className="pdf-button heading-export" onClick={() => exportPdf(model, result)}>PDF</button></>}
            </div>
          </div>
          {analysisError && <div className="error-banner"><strong>No se pudo resolver:</strong> {analysisError}</div>}
          {active === "Modelo" && <ModelView model={model} setModel={setModel} result={result} runAnalysis={runAnalysis} saveModel={saveModel} />}
          {active === "Procedimiento" && result && <ProcedureView model={model} result={result} />}
          {active === "Resultados" && result && <ResultsView model={model} result={result} />}
          {active === "Teoría" && <TheoryView />}
        </div>
      </section>
    </main>
  );
}
