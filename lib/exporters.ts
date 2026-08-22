"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { AnalysisResult, Matrix, TrussModel } from "./truss";
import {
  displacementFromSI,
  forceFromSI,
  formatNumber,
  stiffnessFromSI,
  stressFromSI,
} from "./format";

function safeName(name: string, extension: string) {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${clean || "proyecto-armadura"}.${extension}`;
}

function addPdfHeading(doc: jsPDF, title: string, subtitle?: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(7, 24, 43);
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, 14, 15);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(168, 231, 255);
    doc.text(subtitle, 14, 23);
  }
  doc.setTextColor(24, 34, 48);
}

function addSection(doc: jsPDF, title: string, y: number) {
  if (y > 270) {
    doc.addPage();
    y = 18;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(7, 116, 135);
  doc.text(title, 14, y);
  doc.setDrawColor(45, 184, 205);
  doc.line(14, y + 2.5, 196, y + 2.5);
  doc.setTextColor(24, 34, 48);
  return y + 7;
}

function tableEnd(doc: jsPDF) {
  const state = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  return (state.lastAutoTable?.finalY ?? 18) + 8;
}

function matrixBody(matrix: Matrix, transform = (value: number) => value) {
  return matrix.map((row, index) => [
    `r${index + 1}`,
    ...row.map((value) => formatNumber(transform(value), 5)),
  ]);
}

function addMatrix(
  doc: jsPDF,
  title: string,
  matrix: Matrix,
  unit: string,
  transform = (value: number) => value,
) {
  doc.addPage("landscape");
  addPdfHeading(doc, title, unit);
  autoTable(doc, {
    startY: 42,
    head: [["", ...matrix[0].map((_, index) => `c${index + 1}`)]],
    body: matrixBody(matrix, transform),
    theme: "grid",
    styles: { fontSize: matrix.length > 12 ? 5.2 : 7, halign: "right", cellPadding: 1.25 },
    headStyles: { fillColor: [7, 116, 135], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 248, 250] },
    margin: { left: 8, right: 8 },
  });
}

export function downloadPdf(model: TrussModel, result: AnalysisResult) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  addPdfHeading(doc, "TOCAS Matriz", "Informe completo de análisis matricial de armaduras 2D");
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(model.project.name, 14, 52);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(76, 89, 105);
  const description = doc.splitTextToSize(model.project.description || "Sin descripción.", 180);
  doc.text(description, 14, 61);

  autoTable(doc, {
    startY: 76,
    body: [
      ["Autor", model.project.author || "—"],
      ["Institución", "Universidad Nacional de Cajamarca — Ingeniería Hidráulica"],
      ["Fecha", model.project.date || "—"],
      ["Unidades", `${model.units.force} · ${model.units.length} · ${model.units.area} · ${model.units.stress}`],
      ["Observaciones", model.project.observations || "—"],
    ],
    theme: "grid",
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } },
    headStyles: { fillColor: [7, 116, 135] },
  });

  let y = tableEnd(doc);
  y = addSection(doc, "1. Datos de entrada y geometría", y);
  autoTable(doc, {
    startY: y,
    head: [["Nodo", `X (${model.units.length})`, `Y (${model.units.length})`, `Fx (${model.units.force})`, `Fy (${model.units.force})`, "Restricciones"]],
    body: model.nodes.map((node) => [
      node.label,
      formatNumber(node.x),
      formatNumber(node.y),
      formatNumber(node.fx),
      formatNumber(node.fy),
      [node.restraintX ? "Ux" : "", node.restraintY ? "Uy" : ""].filter(Boolean).join(", ") || "Libre",
    ]),
    theme: "striped",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [7, 116, 135] },
  });
  y = tableEnd(doc);
  autoTable(doc, {
    startY: y,
    head: [["Elem.", "Nodo i", "Nodo j", `A (${model.units.area})`, `E (${model.units.stress})`, "Material"]],
    body: model.elements.map((element) => [
      element.label,
      model.nodes.find((node) => node.id === element.nodeI)?.label ?? element.nodeI,
      model.nodes.find((node) => node.id === element.nodeJ)?.label ?? element.nodeJ,
      formatNumber(element.area),
      formatNumber(element.elasticModulus),
      element.material,
    ]),
    theme: "striped",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [7, 116, 135] },
  });

  doc.addPage();
  addPdfHeading(doc, "Procedimiento y resultados", model.project.name);
  y = 44;
  y = addSection(doc, "2. Geometría, GDL y propiedades calculadas", y);
  autoTable(doc, {
    startY: y,
    head: [["Elem.", `L (${model.units.length})`, "c", "s", "θ (°)", "GDL globales"]],
    body: result.elementResults.map((element) => [
      element.label,
      formatNumber(displacementFromSI(element.length, model.units)),
      formatNumber(element.cosine, 6),
      formatNumber(element.sine, 6),
      formatNumber(element.angleDegrees, 4),
      `[${element.dofs.join(", ")}]`,
    ]),
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [7, 116, 135] },
  });
  y = tableEnd(doc);
  y = addSection(doc, "3. Partición y solución del sistema", y);
  doc.setFontSize(9);
  doc.text(`GDL libres: [${result.freeDofs.join(", ")}]`, 14, y);
  doc.text(`GDL restringidos: [${result.restrainedDofs.join(", ")}]`, 14, y + 6);
  doc.text("Sistema reducido: Kff · Uf = Ff", 14, y + 12);
  y += 19;
  autoTable(doc, {
    startY: y,
    head: [["Nodo", `Ux (${model.units.length})`, `Uy (${model.units.length})`, `Rx (${model.units.force})`, `Ry (${model.units.force})`]],
    body: model.nodes.map((node, index) => [
      node.label,
      formatNumber(displacementFromSI(result.displacements[2 * index], model.units), 7),
      formatNumber(displacementFromSI(result.displacements[2 * index + 1], model.units), 7),
      formatNumber(forceFromSI(result.reactions[2 * index], model.units), 6),
      formatNumber(forceFromSI(result.reactions[2 * index + 1], model.units), 6),
    ]),
    theme: "striped",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [7, 116, 135] },
  });
  y = tableEnd(doc);
  y = addSection(doc, "4. Deformaciones, esfuerzos y fuerzas axiales", y);
  autoTable(doc, {
    startY: y,
    head: [["Elem.", `ΔL (${model.units.length})`, "ε", `σ (${model.units.stress})`, `N (${model.units.force})`, "Estado"]],
    body: result.elementResults.map((element) => [
      element.label,
      formatNumber(displacementFromSI(element.axialDeformation, model.units), 7),
      formatNumber(element.strain, 7),
      formatNumber(stressFromSI(element.stress, model.units), 6),
      formatNumber(forceFromSI(element.axialForce, model.units), 6),
      element.classification,
    ]),
    theme: "striped",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [7, 116, 135] },
  });
  y = tableEnd(doc);
  y = addSection(doc, "5. Comprobación del equilibrio", y);
  autoTable(doc, {
    startY: y,
    body: [
      ["ΣFx aplicada", `${formatNumber(forceFromSI(result.equilibrium.externalX, model.units))} ${model.units.force}`],
      ["ΣRx", `${formatNumber(forceFromSI(result.equilibrium.reactionX, model.units))} ${model.units.force}`],
      ["Residual X", `${formatNumber(forceFromSI(result.equilibrium.residualX, model.units), 8)} ${model.units.force}`],
      ["ΣFy aplicada", `${formatNumber(forceFromSI(result.equilibrium.externalY, model.units))} ${model.units.force}`],
      ["ΣRy", `${formatNumber(forceFromSI(result.equilibrium.reactionY, model.units))} ${model.units.force}`],
      ["Residual Y", `${formatNumber(forceFromSI(result.equilibrium.residualY, model.units), 8)} ${model.units.force}`],
      ["Residual relativo", formatNumber(result.equilibrium.relativeResidual, 9)],
      ["Verificación", result.equilibrium.passed ? "CUMPLE" : "REVISAR"],
    ],
    theme: "grid",
    styles: { fontSize: 8 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
  });

  const stiffnessUnit = `${model.units.force}/${model.units.length}`;
  const stiffnessTransform = (value: number) => stiffnessFromSI(value, model.units);
  result.elementResults.forEach((element) => {
    addMatrix(doc, `Elemento ${element.label} — Matriz de transformación T`, element.transform, "Adimensional");
    addMatrix(doc, `Elemento ${element.label} — Matriz local k′`, element.localExpandedStiffness, stiffnessUnit, stiffnessTransform);
    addMatrix(doc, `Elemento ${element.label} — Matriz global k`, element.globalStiffness, stiffnessUnit, stiffnessTransform);
  });
  addMatrix(doc, "Matriz global K antes de restricciones", result.globalStiffness, stiffnessUnit, stiffnessTransform);
  addMatrix(doc, "Matriz particionada Kff", result.kff, stiffnessUnit, stiffnessTransform);
  if (result.kfr.length && result.kfr[0]?.length) addMatrix(doc, "Matriz particionada Kfr", result.kfr, stiffnessUnit, stiffnessTransform);
  if (result.krf.length && result.krf[0]?.length) addMatrix(doc, "Matriz particionada Krf", result.krf, stiffnessUnit, stiffnessTransform);
  if (result.krr.length && result.krr[0]?.length) addMatrix(doc, "Matriz particionada Krr", result.krr, stiffnessUnit, stiffnessTransform);

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(110, 120, 132);
    doc.text(
      `TOCAS Matriz · Jhoel Tocas Cercado · Página ${page} de ${pages}`,
      14,
      doc.internal.pageSize.getHeight() - 6,
    );
  }
  doc.save(safeName(model.project.name, "pdf"));
}

function sheetFromMatrix(matrix: Matrix, transform = (value: number) => value) {
  return XLSX.utils.aoa_to_sheet([
    ["", ...matrix[0].map((_, index) => `GDL ${index + 1}`)],
    ...matrix.map((row, index) => [`GDL ${index + 1}`, ...row.map(transform)]),
  ]);
}

export function downloadExcel(model: TrussModel, result: AnalysisResult) {
  const workbook = XLSX.utils.book_new();
  const add = (name: string, rows: unknown[][]) =>
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));

  add("Proyecto", [
    ["TOCAS Matriz — Análisis matricial de armaduras 2D"],
    ["Proyecto", model.project.name],
    ["Descripción", model.project.description],
    ["Autor", model.project.author],
    ["Institución", "Universidad Nacional de Cajamarca — Ingeniería Hidráulica"],
    ["Fecha", model.project.date],
    ["Observaciones", model.project.observations],
    ["Longitud", model.units.length],
    ["Área", model.units.area],
    ["Fuerza", model.units.force],
    ["Esfuerzo / E", model.units.stress],
  ]);
  add("Nodos", [
    ["Nodo", `X (${model.units.length})`, `Y (${model.units.length})`, `Fx (${model.units.force})`, `Fy (${model.units.force})`, "Rx", "Ry", "GDL X", "GDL Y"],
    ...model.nodes.map((node, index) => [node.label, node.x, node.y, node.fx, node.fy, node.restraintX, node.restraintY, 2 * index + 1, 2 * index + 2]),
  ]);
  add("Elementos", [
    ["Elemento", "Nodo i", "Nodo j", `Área (${model.units.area})`, `E (${model.units.stress})`, "Material", `L (${model.units.length})`, "c", "s", "θ (°)", "GDL"],
    ...model.elements.map((element, index) => {
      const calc = result.elementResults[index];
      return [element.label, element.nodeI, element.nodeJ, element.area, element.elasticModulus, element.material, displacementFromSI(calc.length, model.units), calc.cosine, calc.sine, calc.angleDegrees, calc.dofs.join(", ")];
    }),
  ]);
  add("Desplazamientos", [
    ["Nodo", `Ux (${model.units.length})`, `Uy (${model.units.length})`],
    ...model.nodes.map((node, index) => [node.label, displacementFromSI(result.displacements[2 * index], model.units), displacementFromSI(result.displacements[2 * index + 1], model.units)]),
  ]);
  add("Reacciones", [
    ["Nodo", `Rx (${model.units.force})`, `Ry (${model.units.force})`],
    ...model.nodes.map((node, index) => [node.label, forceFromSI(result.reactions[2 * index], model.units), forceFromSI(result.reactions[2 * index + 1], model.units)]),
  ]);
  add("Resultados barras", [
    ["Elemento", `ΔL (${model.units.length})`, "Deformación unitaria", `Esfuerzo (${model.units.stress})`, `Fuerza axial (${model.units.force})`, "Clasificación"],
    ...result.elementResults.map((element) => [element.label, displacementFromSI(element.axialDeformation, model.units), element.strain, stressFromSI(element.stress, model.units), forceFromSI(element.axialForce, model.units), element.classification]),
  ]);
  add("Vectores", [
    ["GDL", `F (${model.units.force})`, `U (${model.units.length})`, `R (${model.units.force})`, "Tipo"],
    ...result.forceVector.map((force, index) => [index + 1, forceFromSI(force, model.units), displacementFromSI(result.displacements[index], model.units), forceFromSI(result.reactions[index], model.units), result.restrainedDofs.includes(index + 1) ? "Restringido" : "Libre"]),
  ]);
  add("Equilibrio", [
    ["Magnitud", "Valor SI"],
    ["Fx externa", result.equilibrium.externalX],
    ["Rx", result.equilibrium.reactionX],
    ["Residual X", result.equilibrium.residualX],
    ["Fy externa", result.equilibrium.externalY],
    ["Ry", result.equilibrium.reactionY],
    ["Residual Y", result.equilibrium.residualY],
    ["Momento externo (N·m)", result.equilibrium.externalMoment],
    ["Momento reacciones (N·m)", result.equilibrium.reactionMoment],
    ["Residual momento (N·m)", result.equilibrium.residualMoment],
    ["Residual relativo", result.equilibrium.relativeResidual],
    ["Cumple", result.equilibrium.passed],
  ]);

  const stiffnessTransform = (value: number) => stiffnessFromSI(value, model.units);
  XLSX.utils.book_append_sheet(workbook, sheetFromMatrix(result.globalStiffness, stiffnessTransform), "K Global");
  XLSX.utils.book_append_sheet(workbook, sheetFromMatrix(result.kff, stiffnessTransform), "Kff");
  result.elementResults.forEach((element) => {
    const rows: unknown[][] = [
      [`Elemento ${element.label}`],
      ["Matriz de transformación T"],
      ...element.transform,
      [],
      [`Matriz local (${model.units.force}/${model.units.length})`],
      ...element.localExpandedStiffness.map((row) => row.map(stiffnessTransform)),
      [],
      [`Matriz global (${model.units.force}/${model.units.length})`],
      ...element.globalStiffness.map((row) => row.map(stiffnessTransform)),
    ];
    add(`Matrices E${element.label}`, rows);
  });
  XLSX.writeFile(workbook, safeName(model.project.name, "xlsx"));
}

export function downloadJson(model: TrussModel) {
  const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName(model.project.name, "json");
  anchor.click();
  URL.revokeObjectURL(url);
}
