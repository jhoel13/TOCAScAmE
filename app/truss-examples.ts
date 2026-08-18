import { TrussElement, TrussModel, TrussNode } from "./truss-engine";

const node = (
  id: string,
  x: number,
  y: number,
  options: Partial<Pick<TrussNode, "restraintX" | "restraintY" | "fx" | "fy">> = {},
): TrussNode => ({
  id,
  x,
  y,
  restraintX: options.restraintX ?? false,
  restraintY: options.restraintY ?? false,
  fx: options.fx ?? 0,
  fy: options.fy ?? 0,
});

const elementsFromPairs = (pairs: string[][], area: number, elasticModulus: number): TrussElement[] =>
  pairs.map(([start, end], index) => ({ id: `B${index + 1}`, start, end, area, elasticModulus }));

export const example1: TrussModel = {
  name: "Ejemplo 1 · Armadura simétrica",
  description: "Problema 1 del notebook guía. Armadura de seis nodos y nueve barras con cargas en D, E y F.",
  source: "Análisis matricial de estructuras – Alder Quispe · notebook proporcionado por Jhoel Tocas",
  lengthUnit: "cm",
  forceUnit: "kgf",
  nodes: [
    node("A", 0, 0, { restraintX: true, restraintY: true }),
    node("B", 300, 0),
    node("C", 600, 0, { restraintY: true }),
    node("D", 150, 100, { fx: 2000, fy: -1000 }),
    node("E", 300, 200, { fx: 2000, fy: -1000 }),
    node("F", 450, 100, { fx: 2000, fy: -1000 }),
  ],
  elements: elementsFromPairs([
    ["A", "B"], ["B", "C"], ["B", "D"], ["B", "F"], ["B", "E"],
    ["A", "D"], ["D", "E"], ["E", "F"], ["F", "C"],
  ], 25, 2e6),
};

export const example2: TrussModel = {
  name: "Ejemplo 2 · Armadura compuesta",
  description: "Problema 2 del notebook guía. Sistema de veintiocho nodos y cincuenta y ocho barras.",
  source: "Notebook Problema 2 proporcionado por Jhoel Tocas",
  lengthUnit: "cm",
  forceUnit: "kN",
  nodes: [
    node("A", 1000, 0, { restraintX: true, restraintY: true }),
    node("B", 3400, 2000),
    node("C", 975, 250),
    node("D", 3400, 1500, { restraintY: true }),
    node("E", 1050, 500),
    node("F", 900, 1000, { fx: 22 }),
    node("G", 3100, 1750),
    node("H", 850, 1500),
    node("I", 1150, 1500),
    node("J", 0, 2000, { fx: 8, fy: -160 }),
    node("K", 400, 2000),
    node("L", 400, 2200),
    node("M", 800, 2000),
    node("N", 800, 2400),
    node("O", 1200, 2000),
    node("P", 1200, 2400),
    node("Q", 1600, 2000),
    node("R", 1600, 2400),
    node("S", 2000, 2000, { fy: -510 }),
    node("T", 2000, 2400),
    node("U", 2400, 2000),
    node("V", 2400, 2400),
    node("W", 2800, 2000),
    node("X", 2800, 2400),
    node("Y", 3100, 2000),
    node("Z", 3100, 2200),
    node("1", 950, 500),
    node("2", 1100, 1000),
  ],
  elements: elementsFromPairs([
    ["A", "C"], ["A", "E"], ["C", "E"], ["C", "1"], ["1", "E"], ["1", "F"], ["1", "2"],
    ["E", "F"], ["E", "2"], ["F", "2"], ["F", "H"], ["F", "I"], ["2", "H"], ["2", "I"],
    ["H", "I"], ["H", "M"], ["H", "O"], ["I", "O"], ["J", "K"], ["K", "M"], ["M", "O"],
    ["O", "Q"], ["Q", "S"], ["S", "U"], ["U", "W"], ["W", "Y"], ["Y", "B"], ["W", "G"],
    ["G", "B"], ["G", "D"], ["D", "B"], ["J", "L"], ["K", "L"], ["L", "N"], ["L", "M"],
    ["K", "N"], ["M", "N"], ["M", "P"], ["N", "P"], ["O", "P"], ["O", "R"], ["Q", "P"],
    ["Q", "R"], ["P", "R"], ["S", "R"], ["S", "T"], ["T", "R"], ["S", "V"], ["U", "V"],
    ["T", "V"], ["U", "X"], ["W", "V"], ["W", "X"], ["V", "X"], ["W", "Z"], ["X", "Z"],
    ["Y", "Z"], ["Z", "B"],
  ], 625, 21000),
};

export const newModelTemplate: TrussModel = {
  name: "Nuevo modelo",
  description: "Plantilla estable de tres barras. Modifica, agrega o elimina nodos y barras.",
  source: "Modelo editable",
  lengthUnit: "cm",
  forceUnit: "kgf",
  nodes: [
    node("A", 0, 0, { restraintX: true, restraintY: true }),
    node("B", 400, 0, { restraintY: true }),
    node("C", 200, 250, { fy: -1000 }),
  ],
  elements: elementsFromPairs([["A", "B"], ["A", "C"], ["B", "C"]], 25, 2e6),
};

export const examples = {
  example1,
  example2,
  newModelTemplate,
};
