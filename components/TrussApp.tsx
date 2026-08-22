"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { MatrixView } from "./MatrixView";
import { TrussCanvas } from "./TrussCanvas";
import {
  analyzeTruss,
  AREA_TO_M2,
  exampleBridge,
  exampleTriangle,
  FORCE_TO_N,
  LENGTH_TO_M,
  materialLibrary,
  STRESS_TO_PA,
  type AnalysisOutput,
  type AnalysisResult,
  type AreaUnit,
  type ForceUnit,
  type LengthUnit,
  type StressUnit,
  type TrussElement,
  type TrussModel,
  type TrussNode,
  type UnitSystem,
} from "@/lib/truss";
import {
  displacementFromSI,
  forceFromSI,
  formatNumber,
  stiffnessFromSI,
  stressFromSI,
} from "@/lib/format";

type User = { displayName: string; email: string } | null;
type View = "modelo" | "procedimiento" | "resultados" | "teoria";
type EditorStep = "proyecto" | "nodos" | "elementos" | "cargas";

type SavedProject = {
  id: string;
  name: string;
  data: TrussModel;
  createdAt: string;
  updatedAt: string;
};

const cloneModel = (model: TrussModel): TrussModel => JSON.parse(JSON.stringify(model));
const makeId = (prefix: string) =>
  `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;

const reviewItems = [
  "Datos de entrada",
  "Geometría",
  "Numeración de nodos",
  "Numeración de elementos",
  "Coordenadas",
  "Propiedades de materiales",
  "Longitudes",
  "Cosenos directores",
  "Matrices de transformación",
  "Matrices locales",
  "Matrices globales por elemento",
  "Grados de libertad",
  "GDL restringidos",
  "GDL libres",
  "Vector global de cargas",
  "Matriz global antes de restricciones",
  "Proceso de ensamblaje",
  "Matrices particionadas",
  "Sistema reducido",
  "Desplazamientos",
  "Reacciones",
  "Deformaciones",
  "Esfuerzos",
  "Fuerzas axiales",
  "Tracción / compresión",
  "Estructura deformada",
  "Comprobación del equilibrio",
];

function nextNodeLabel(index: number) {
  if (index < 26) return String.fromCharCode(65 + index);
  return `N${index + 1}`;
}

function parseNumeric(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function convertUnits(model: TrussModel, nextUnits: UnitSystem): TrussModel {
  const old = model.units;
  return {
    ...model,
    units: nextUnits,
    nodes: model.nodes.map((node) => ({
      ...node,
      x: (node.x * LENGTH_TO_M[old.length]) / LENGTH_TO_M[nextUnits.length],
      y: (node.y * LENGTH_TO_M[old.length]) / LENGTH_TO_M[nextUnits.length],
      fx: (node.fx * FORCE_TO_N[old.force]) / FORCE_TO_N[nextUnits.force],
      fy: (node.fy * FORCE_TO_N[old.force]) / FORCE_TO_N[nextUnits.force],
    })),
    elements: model.elements.map((element) => ({
      ...element,
      area: (element.area * AREA_TO_M2[old.area]) / AREA_TO_M2[nextUnits.area],
      elasticModulus:
        (element.elasticModulus * STRESS_TO_PA[old.stress]) / STRESS_TO_PA[nextUnits.stress],
    })),
  };
}

function Icon({ name }: { name: "model" | "procedure" | "results" | "theory" | "save" | "download" }) {
  const paths = {
    model: <><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><circle cx="12" cy="6" r="2.5"/><path d="M7.3 15.8 10.7 8.2M13.3 8.2l3.4 7.6M8.5 18h7"/></>,
    procedure: <><path d="M7 4h10M7 10h10M7 16h7"/><circle cx="4" cy="4" r="1"/><circle cx="4" cy="10" r="1"/><circle cx="4" cy="16" r="1"/></>,
    results: <><path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/></>,
    theory: <><path d="M4 5.5A4 4 0 0 1 8 4h4v16H8a4 4 0 0 0-4 1V5.5Zm16 0A4 4 0 0 0 16 4h-4v16h4a4 4 0 0 1 4 1V5.5Z"/></>,
    save: <><path d="M5 3h11l3 3v15H5V3Z"/><path d="M8 3v6h8V3M8 21v-8h8v8"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function TrussApp({ user, signInPath, signOutPath }: { user: User; signInPath: string; signOutPath: string }) {
  const [model, setModel] = useState<TrussModel>(() => cloneModel(exampleTriangle));
  const [analysis, setAnalysis] = useState<AnalysisOutput>(() => analyzeTruss(cloneModel(exampleTriangle)));
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<View>("modelo");
  const [editorStep, setEditorStep] = useState<EditorStep>("nodos");
  const [selectedElementId, setSelectedElementId] = useState("e1");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [deformationScale, setDeformationScale] = useState(100);
  const [visual, setVisual] = useState({
    nodes: true,
    nodeLabels: true,
    elementLabels: true,
    supports: true,
    forces: true,
    localAxes: false,
    lengths: false,
    deformed: true,
  });
  const [nodePlacementMode, setNodePlacementMode] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapStep, setSnapStep] = useState(0.5);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("Nodo\tX\tY\nD\t6\t2");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [autoSave, setAutoSave] = useState(true);
  const [projectPanel, setProjectPanel] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [projectLoading, setProjectLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [materials, setMaterials] = useState(() => materialLibrary.map((item) => ({ ...item })));
  const fileInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);

  const result = analysis.ok ? analysis : null;
  const selectedElement = result?.elementResults.find((element) => element.id === selectedElementId) ?? result?.elementResults[0] ?? null;
  const stiffnessUnit = `${model.units.force}/${model.units.length}`;
  const stiffnessTransform = (value: number) => stiffnessFromSI(value, model.units);

  const exportPdf = async () => {
    if (!result) return;
    const { downloadPdf } = await import("@/lib/exporters");
    downloadPdf(model, result);
  };

  const exportExcel = async () => {
    if (!result) return;
    const { downloadExcel } = await import("@/lib/exporters");
    downloadExcel(model, result);
  };

  const exportJson = async () => {
    const { downloadJson } = await import("@/lib/exporters");
    downloadJson(model);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("tocas-theme", theme);
  }, [theme]);

  const updateModel = (updater: (current: TrussModel) => TrussModel) => {
    setModel((current) => {
      const next = updater(current);
      if (next.project.id.startsWith("example-")) {
        next.project = { ...next.project, id: makeId("project") };
      }
      return next;
    });
    setDirty(true);
    setSaveState("idle");
  };

  const runAnalysis = () => {
    const next = analyzeTruss(model);
    setAnalysis(next);
    setDirty(false);
    if (next.ok) {
      setView("resultados");
      setNotice("Cálculo completado: sistema resuelto y equilibrio verificado.");
    } else {
      setNotice("El modelo contiene errores que impiden ejecutar el cálculo.");
    }
  };

  const saveProject = async (silent = false) => {
    if (!user) {
      if (!silent) setNotice("Inicia sesión para guardar proyectos en tu cuenta.");
      return;
    }
    setSaveState("saving");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model }),
      });
      if (!response.ok) throw new Error("No se pudo guardar");
      setSaveState("saved");
      if (!silent) setNotice("Proyecto guardado correctamente.");
    } catch {
      setSaveState("error");
      if (!silent) setNotice("No se pudo guardar el proyecto. Inténtalo nuevamente.");
    }
  };

  useEffect(() => {
    if (!user || !autoSave || model.project.id.startsWith("example-")) return;
    const timer = window.setTimeout(() => void saveProject(true), 1600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, user?.email, autoSave]);

  const loadExample = (source: TrussModel) => {
    const next = cloneModel(source);
    setModel(next);
    setAnalysis(analyzeTruss(next));
    setDirty(false);
    setSelectedElementId(next.elements[0]?.id ?? "");
    setView("modelo");
    setEditorStep("nodos");
    setNotice(`${next.project.name} cargado.`);
  };

  const addNode = (x?: number, y?: number) => {
    updateModel((current) => ({
      ...current,
      nodes: [
        ...current.nodes,
        {
          id: makeId("node"),
          label: nextNodeLabel(current.nodes.length),
          x: x ?? 0,
          y: y ?? 0,
          restraintX: false,
          restraintY: false,
          fx: 0,
          fy: 0,
        },
      ],
    }));
  };

  const updateNode = <K extends keyof TrussNode>(id: string, key: K, value: TrussNode[K]) => {
    updateModel((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === id ? { ...node, [key]: value } : node)),
    }));
  };

  const duplicateNode = (id: string) => {
    updateModel((current) => {
      const node = current.nodes.find((item) => item.id === id);
      if (!node) return current;
      const offset = snapEnabled ? snapStep : 0.5;
      return {
        ...current,
        nodes: [
          ...current.nodes,
          {
            ...node,
            id: makeId("node"),
            label: nextNodeLabel(current.nodes.length),
            x: node.x + offset,
            y: node.y + offset,
          },
        ],
      };
    });
  };

  const removeNode = (id: string) => {
    const linked = model.elements.filter((element) => element.nodeI === id || element.nodeJ === id).length;
    if (linked && !window.confirm(`Este nodo está conectado a ${linked} elemento(s). También se eliminarán. ¿Continuar?`)) return;
    updateModel((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== id),
      elements: current.elements.filter((element) => element.nodeI !== id && element.nodeJ !== id),
    }));
  };

  const addElement = () => {
    if (model.nodes.length < 2) {
      setNotice("Crea al menos dos nodos antes de agregar una barra.");
      return;
    }
    updateModel((current) => {
      const element: TrussElement = {
        id: makeId("element"),
        label: String(current.elements.length + 1),
        nodeI: current.nodes[0].id,
        nodeJ: current.nodes[1].id,
        area: current.units.area === "cm²" ? 20 : current.units.area === "mm²" ? 2000 : 0.002,
        elasticModulus:
          (200e9 / STRESS_TO_PA[current.units.stress]),
        material: "Acero",
      };
      setSelectedElementId(element.id);
      return { ...current, elements: [...current.elements, element] };
    });
  };

  const updateElement = <K extends keyof TrussElement>(id: string, key: K, value: TrussElement[K]) => {
    updateModel((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === id ? { ...element, [key]: value } : element,
      ),
    }));
  };

  const removeElement = (id: string) => {
    updateModel((current) => ({
      ...current,
      elements: current.elements.filter((element) => element.id !== id),
    }));
  };

  const applyMaterial = (elementId: string, name: string) => {
    const material = materials.find((item) => item.name === name);
    updateModel((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === elementId
          ? {
              ...element,
              material: name,
              elasticModulus: material
                ? (material.elasticModulusGPa * 1e9) / STRESS_TO_PA[current.units.stress]
                : element.elasticModulus,
            }
          : element,
      ),
    }));
  };

  const parseNodeRows = (rows: unknown[][]) => {
    const clean = rows.filter((row) => row.some((cell) => String(cell ?? "").trim()));
    if (!clean.length) return;
    const first = clean[0].map((cell) => String(cell ?? "").trim().toLowerCase());
    const hasHeader = first.some((cell) => ["nodo", "node", "x", "y"].includes(cell));
    const data = hasHeader ? clean.slice(1) : clean;
    const imported: TrussNode[] = data
      .map((row, index) => ({
        id: makeId("node"),
        label: String(row[0] ?? nextNodeLabel(index)).trim() || nextNodeLabel(index),
        x: parseNumeric(String(row[1] ?? 0)),
        y: parseNumeric(String(row[2] ?? 0)),
        fx: parseNumeric(String(row[3] ?? 0)),
        fy: parseNumeric(String(row[4] ?? 0)),
        restraintX: ["1", "true", "sí", "si", "x"].includes(String(row[5] ?? "").toLowerCase()),
        restraintY: ["1", "true", "sí", "si", "y"].includes(String(row[6] ?? "").toLowerCase()),
      }))
      .filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
    if (!imported.length) {
      setNotice("No se encontraron filas de nodos válidas.");
      return;
    }
    updateModel((current) => ({ ...current, nodes: [...current.nodes, ...imported] }));
    setNotice(`${imported.length} nodo(s) importados.`);
  };

  const importNodesFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    parseNodeRows(XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]);
    event.target.value = "";
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as TrussModel;
      if (!parsed.nodes || !parsed.elements || !parsed.units || !parsed.project) throw new Error("Formato inválido");
      setModel(parsed);
      setAnalysis(analyzeTruss(parsed));
      setDirty(false);
      setNotice("Proyecto JSON importado.");
    } catch {
      setNotice("El archivo JSON no corresponde a un proyecto válido.");
    }
    event.target.value = "";
  };

  const importPastedRows = () => {
    const rows = pasteText
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.split(/\t|;|,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/));
    parseNodeRows(rows);
    setPasteOpen(false);
  };

  const fetchProjects = async () => {
    if (!user) return;
    setProjectLoading(true);
    try {
      const response = await fetch("/api/projects");
      const data = await response.json() as { projects?: SavedProject[] };
      setSavedProjects(data.projects ?? []);
    } finally {
      setProjectLoading(false);
    }
  };

  const openProjects = () => {
    setProjectPanel(true);
    void fetchProjects();
  };

  const deleteSavedProject = async (id: string) => {
    if (!window.confirm("¿Eliminar este proyecto guardado?")) return;
    const response = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) void fetchProjects();
  };

  const loadSavedProject = (project: SavedProject) => {
    setModel(project.data);
    setAnalysis(analyzeTruss(project.data));
    setDirty(false);
    setProjectPanel(false);
    setNotice(`Proyecto “${project.name}” abierto.`);
  };

  const changeUnit = <K extends keyof UnitSystem>(key: K, value: UnitSystem[K]) => {
    const nextUnits = { ...model.units, [key]: value } as UnitSystem;
    updateModel((current) => convertUnits(current, nextUnits));
  };

  const navItems: { id: View; label: string; icon: "model" | "procedure" | "results" | "theory" }[] = [
    { id: "modelo", label: "Modelo", icon: "model" },
    { id: "procedimiento", label: "Procedimiento", icon: "procedure" },
    { id: "resultados", label: "Resultados", icon: "results" },
    { id: "teoria", label: "Teoría", icon: "theory" },
  ];

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <strong>TOCAS <em>Matriz</em></strong>
            <small>Análisis de armaduras 2D</small>
          </div>
        </div>
        <nav className="main-nav" aria-label="Navegación principal">
          {navItems.map((item) => (
            <button key={item.id} type="button" className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button className="icon-button" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Cambiar modo de color">
            {theme === "dark" ? "☀" : "◐"}
          </button>
          {user ? (
            <div className="user-menu">
              <button type="button" className="user-chip" onClick={openProjects}>
                <span>{user.displayName.slice(0, 1).toUpperCase()}</span>
                <span className="user-copy"><b>{user.displayName}</b><small>Mis proyectos</small></span>
              </button>
              <a href={signOutPath} className="text-action">Salir</a>
            </div>
          ) : (
            <a className="primary small" href={signInPath}>Ingresar / registrarse</a>
          )}
        </div>
      </header>

      <div className="app-body">
        <aside className="side-rail">
          <div className="rail-project">
            <span className="eyebrow">PROYECTO ACTIVO</span>
            <button type="button" onClick={() => { setView("modelo"); setEditorStep("proyecto"); }}>
              <b>{model.project.name}</b>
              <small>{model.nodes.length} nodos · {model.elements.length} barras</small>
            </button>
          </div>
          <div className="rail-actions">
            <button type="button" onClick={() => void saveProject()}><Icon name="save" /><span>Guardar</span><small>{saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado" : user ? "En tu cuenta" : "Requiere ingreso"}</small></button>
            <button type="button" onClick={() => void exportJson()}><Icon name="download" /><span>Proyecto JSON</span><small>Respaldo editable</small></button>
          </div>
          <div className="rail-review">
            <span className="eyebrow">CONTROL DEL ANÁLISIS</span>
            <div className={`status-card ${analysis.ok && !dirty ? "success" : dirty ? "warning" : "error"}`}>
              <i />
              <div>
                <b>{dirty ? "Cambios sin calcular" : analysis.ok ? "Modelo resuelto" : "Modelo por revisar"}</b>
                <small>{analysis.ok ? `${analysis.ndof} GDL · ${analysis.warnings.length} aviso(s)` : `${analysis.errors.length} error(es)`}</small>
              </div>
            </div>
          </div>
          <footer>
            <b>Jhoel Tocas Cercado</b>
            <span>Ingeniería Hidráulica · UNC</span>
            <small>Motor lineal elástico · Armaduras 2D</small>
          </footer>
        </aside>

        <main className="workspace">
          {notice ? (
            <div className="toast" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice(null)}>×</button></div>
          ) : null}

          {view === "modelo" ? (
            <>
              <section className="workspace-heading">
                <div>
                  <span className="eyebrow">ASISTENTE DE MODELADO</span>
                  <h1>Construye y verifica tu armadura</h1>
                  <p>Todos los datos son editables. El cálculo se realiza internamente en SI para evitar mezclas de unidades.</p>
                </div>
                <div className="heading-actions">
                  <button type="button" className="secondary" onClick={() => loadExample(exampleTriangle)}>Ejemplo 1</button>
                  <button type="button" className="secondary" onClick={() => loadExample(exampleBridge)}>Ejemplo 2</button>
                  <button type="button" className="primary" onClick={runAnalysis}>Calcular estructura <span>→</span></button>
                </div>
              </section>

              <div className="model-grid">
                <section className="editor-card">
                  <div className="step-tabs" role="tablist" aria-label="Pasos de ingreso">
                    {([
                      ["proyecto", "1", "Proyecto"],
                      ["nodos", "2", "Nodos"],
                      ["elementos", "3", "Barras"],
                      ["cargas", "4", "Unidades"],
                    ] as const).map(([id, number, label]) => (
                      <button key={id} type="button" role="tab" aria-selected={editorStep === id} className={editorStep === id ? "active" : ""} onClick={() => setEditorStep(id)}>
                        <span>{number}</span>{label}
                      </button>
                    ))}
                  </div>

                  {editorStep === "proyecto" ? (
                    <div className="editor-content form-grid">
                      <label className="field wide"><span>Nombre del proyecto</span><input value={model.project.name} onChange={(event) => updateModel((current) => ({ ...current, project: { ...current.project, name: event.target.value } }))} /></label>
                      <label className="field wide"><span>Descripción</span><textarea rows={3} value={model.project.description} onChange={(event) => updateModel((current) => ({ ...current, project: { ...current.project, description: event.target.value } }))} /></label>
                      <label className="field"><span>Autor</span><input value={model.project.author} onChange={(event) => updateModel((current) => ({ ...current, project: { ...current.project, author: event.target.value } }))} /></label>
                      <label className="field"><span>Fecha</span><input type="date" value={model.project.date} onChange={(event) => updateModel((current) => ({ ...current, project: { ...current.project, date: event.target.value } }))} /></label>
                      <label className="field wide"><span>Observaciones</span><textarea rows={4} value={model.project.observations} onChange={(event) => updateModel((current) => ({ ...current, project: { ...current.project, observations: event.target.value } }))} /></label>
                      <div className="autosave-row wide"><label className="switch"><input type="checkbox" checked={autoSave} onChange={(event) => setAutoSave(event.target.checked)} /><span /> Guardado automático</label><small>{user ? "Los cambios se guardan en tu cuenta." : "Inicia sesión para activar el guardado persistente."}</small></div>
                    </div>
                  ) : null}

                  {editorStep === "nodos" ? (
                    <div className="editor-content">
                      <div className="table-tools">
                        <div><button type="button" className="primary small" onClick={() => addNode()}>＋ Nodo</button><button type="button" onClick={() => setNodePlacementMode(!nodePlacementMode)} className={nodePlacementMode ? "secondary active" : "secondary"}>⌖ Crear en plano</button></div>
                        <div><button type="button" className="text-action" onClick={() => fileInput.current?.click()}>Importar Excel/CSV</button><button type="button" className="text-action" onClick={() => setPasteOpen(!pasteOpen)}>Pegar datos</button><button type="button" className="text-action" onClick={() => updateModel((current) => ({ ...current, nodes: [...current.nodes].sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true })) }))}>Ordenar</button></div>
                        <input ref={fileInput} type="file" hidden accept=".xlsx,.xls,.csv,.tsv" onChange={importNodesFile} />
                      </div>
                      {pasteOpen ? (
                        <div className="paste-panel"><textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} rows={5} /><div><small>Columnas: Nodo, X, Y, Fx, Fy, restringir X, restringir Y.</small><button type="button" className="primary small" onClick={importPastedRows}>Agregar filas</button></div></div>
                      ) : null}
                      <div className="data-table-scroll">
                        <table className="data-table nodes-table">
                          <thead><tr><th>#</th><th>Nodo</th><th>X ({model.units.length})</th><th>Y ({model.units.length})</th><th>GDL</th><th>Rx</th><th>Ry</th><th /></tr></thead>
                          <tbody>
                            {model.nodes.map((node, index) => (
                              <tr key={node.id}>
                                <td>{index + 1}</td>
                                <td><input aria-label={`Nombre nodo ${index + 1}`} value={node.label} onChange={(event) => updateNode(node.id, "label", event.target.value)} /></td>
                                <td><input type="number" step="any" aria-label={`X nodo ${node.label}`} value={node.x} onChange={(event) => updateNode(node.id, "x", Number(event.target.value))} /></td>
                                <td><input type="number" step="any" aria-label={`Y nodo ${node.label}`} value={node.y} onChange={(event) => updateNode(node.id, "y", Number(event.target.value))} /></td>
                                <td><span className="dof-chip">{2 * index + 1},{2 * index + 2}</span></td>
                                <td><input type="checkbox" aria-label={`Restringir X nodo ${node.label}`} checked={node.restraintX} onChange={(event) => updateNode(node.id, "restraintX", event.target.checked)} /></td>
                                <td><input type="checkbox" aria-label={`Restringir Y nodo ${node.label}`} checked={node.restraintY} onChange={(event) => updateNode(node.id, "restraintY", event.target.checked)} /></td>
                                <td className="row-actions"><button type="button" title="Duplicar" onClick={() => duplicateNode(node.id)}>⧉</button><button type="button" title="Eliminar" onClick={() => removeNode(node.id)}>×</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="snap-row"><label className="switch"><input type="checkbox" checked={snapEnabled} onChange={(event) => setSnapEnabled(event.target.checked)} /><span /> SNAP</label><label>Paso <input type="number" min="0.0001" step="any" value={snapStep} onChange={(event) => setSnapStep(Number(event.target.value))} /> {model.units.length}</label></div>
                    </div>
                  ) : null}

                  {editorStep === "elementos" ? (
                    <div className="editor-content">
                      <div className="table-tools"><div><button type="button" className="primary small" onClick={addElement}>＋ Barra</button></div><small>Cada elemento admite A, E y material independientes.</small></div>
                      <div className="data-table-scroll">
                        <table className="data-table element-table">
                          <thead><tr><th>Elem.</th><th>Nodo i</th><th>Nodo j</th><th>A ({model.units.area})</th><th>E ({model.units.stress})</th><th>Material</th><th /></tr></thead>
                          <tbody>
                            {model.elements.map((element) => (
                              <tr key={element.id}>
                                <td><input value={element.label} aria-label="Número de elemento" onChange={(event) => updateElement(element.id, "label", event.target.value)} /></td>
                                <td><select value={element.nodeI} onChange={(event) => updateElement(element.id, "nodeI", event.target.value)}>{model.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></td>
                                <td><select value={element.nodeJ} onChange={(event) => updateElement(element.id, "nodeJ", event.target.value)}>{model.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></td>
                                <td><input type="number" min="0" step="any" value={element.area} onChange={(event) => updateElement(element.id, "area", Number(event.target.value))} /></td>
                                <td><input type="number" min="0" step="any" value={element.elasticModulus} onChange={(event) => updateElement(element.id, "elasticModulus", Number(event.target.value))} /></td>
                                <td><select value={element.material} onChange={(event) => applyMaterial(element.id, event.target.value)}>{materials.map((material) => <option key={material.name}>{material.name}</option>)}</select></td>
                                <td className="row-actions"><button type="button" title="Eliminar" onClick={() => removeElement(element.id)}>×</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="material-library">
                        <div><span className="eyebrow">BIBLIOTECA EDITABLE</span><p>Valores referenciales; siempre puedes sobrescribir E en la tabla.</p></div>
                        <div className="material-chips">
                          {materials.map((material, index) => (
                            <label key={material.name}><span>{material.name}</span><input type="number" step="any" value={material.elasticModulusGPa} onChange={(event) => setMaterials((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, elasticModulusGPa: Number(event.target.value) } : item))} /><small>GPa</small></label>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {editorStep === "cargas" ? (
                    <div className="editor-content">
                      <div className="unit-panel">
                        <div><span className="eyebrow">SISTEMA DE UNIDADES</span><p>Al cambiar una unidad, todos los valores se convierten automáticamente conservando el mismo modelo físico.</p></div>
                        <div className="unit-grid">
                          <label><span>Longitud</span><select value={model.units.length} onChange={(event) => changeUnit("length", event.target.value as LengthUnit)}>{(["mm", "cm", "m"] as const).map((unit) => <option key={unit}>{unit}</option>)}</select></label>
                          <label><span>Área</span><select value={model.units.area} onChange={(event) => changeUnit("area", event.target.value as AreaUnit)}>{(["mm²", "cm²", "m²"] as const).map((unit) => <option key={unit}>{unit}</option>)}</select></label>
                          <label><span>Fuerza</span><select value={model.units.force} onChange={(event) => changeUnit("force", event.target.value as ForceUnit)}>{(["N", "kN", "kgf", "tf"] as const).map((unit) => <option key={unit}>{unit}</option>)}</select></label>
                          <label><span>Esfuerzo / E</span><select value={model.units.stress} onChange={(event) => changeUnit("stress", event.target.value as StressUnit)}>{(["Pa", "kPa", "MPa", "GPa", "kgf/cm²", "kN/cm²"] as const).map((unit) => <option key={unit}>{unit}</option>)}</select></label>
                        </div>
                      </div>
                      <div className="table-tools"><div><strong>Cargas nodales y apoyos</strong></div><small>Convención: +X derecha, +Y arriba.</small></div>
                      <div className="data-table-scroll">
                        <table className="data-table load-table">
                          <thead><tr><th>Nodo</th><th>Fx ({model.units.force})</th><th>Fy ({model.units.force})</th><th>Restringe X</th><th>Restringe Y</th><th>Tipo</th></tr></thead>
                          <tbody>{model.nodes.map((node) => <tr key={node.id}><td><b>{node.label}</b></td><td><input type="number" step="any" value={node.fx} onChange={(event) => updateNode(node.id, "fx", Number(event.target.value))} /></td><td><input type="number" step="any" value={node.fy} onChange={(event) => updateNode(node.id, "fy", Number(event.target.value))} /></td><td><input type="checkbox" checked={node.restraintX} onChange={(event) => updateNode(node.id, "restraintX", event.target.checked)} /></td><td><input type="checkbox" checked={node.restraintY} onChange={(event) => updateNode(node.id, "restraintY", event.target.checked)} /></td><td><span className="support-label">{node.restraintX && node.restraintY ? "Articulado" : node.restraintY ? "Rodillo Y" : node.restraintX ? "Rodillo X" : "Libre"}</span></td></tr>)}</tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="visual-card">
                  <div className="card-title"><div><span className="eyebrow">GEOMETRÍA INTERACTIVA</span><h2>Vista de la armadura</h2></div><span className={`live-pill ${dirty ? "dirty" : ""}`}>{dirty ? "Por recalcular" : result ? "Resultados activos" : "Modelo"}</span></div>
                  <TrussCanvas model={model} result={dirty ? null : result} deformationScale={deformationScale} showNodes={visual.nodes} showNodeLabels={visual.nodeLabels} showElementLabels={visual.elementLabels} showSupports={visual.supports} showForces={visual.forces} showLocalAxes={visual.localAxes} showLengths={visual.lengths} showDeformed={visual.deformed} nodePlacementMode={nodePlacementMode} snapEnabled={snapEnabled} snapStep={snapStep} onAddNode={(x, y) => addNode(x, y)} />
                  <div className="visual-controls">
                    {([
                      ["nodes", "Nodos"], ["nodeLabels", "Etiquetas"], ["elementLabels", "Barras"], ["supports", "Apoyos"], ["forces", "Fuerzas"], ["localAxes", "Ejes locales"], ["lengths", "Longitudes"], ["deformed", "Deformada"],
                    ] as const).map(([key, label]) => <label key={key} className="check-pill"><input type="checkbox" checked={visual[key]} onChange={(event) => setVisual((current) => ({ ...current, [key]: event.target.checked }))} /><span>{label}</span></label>)}
                  </div>
                  {visual.deformed ? <label className="scale-control"><span>Escala deformada</span><input type="range" min="1" max="1000" step="1" value={deformationScale} onChange={(event) => setDeformationScale(Number(event.target.value))} /><output>×{deformationScale}</output></label> : null}
                </section>
              </div>

              <section className="validation-strip">
                <div><span className={`validation-icon ${analysis.ok ? "ok" : "bad"}`}>{analysis.ok ? "✓" : "!"}</span><div><b>{analysis.ok ? "Validación estructural disponible" : "Hay errores críticos"}</b><small>{analysis.ok ? "La última solución matemática fue completada." : analysis.errors[0]}</small></div></div>
                <div className="validation-metrics"><span><b>{model.nodes.length * 2}</b> GDL</span><span><b>{model.nodes.reduce((sum, node) => sum + Number(node.restraintX) + Number(node.restraintY), 0)}</b> restringidos</span><span><b>{model.elements.length}</b> elementos</span></div>
                <button type="button" className="primary" onClick={runAnalysis}>Ejecutar cálculo completo</button>
              </section>
            </>
          ) : null}

          {view === "procedimiento" ? (
            <ProcedureView model={model} analysis={analysis} dirty={dirty} selectedElementId={selectedElementId} setSelectedElementId={setSelectedElementId} selectedElement={selectedElement} stiffnessUnit={stiffnessUnit} stiffnessTransform={stiffnessTransform} onCalculate={runAnalysis} />
          ) : null}

          {view === "resultados" ? (
            <ResultsView model={model} analysis={analysis} dirty={dirty} deformationScale={deformationScale} setDeformationScale={setDeformationScale} visual={visual} onCalculate={runAnalysis} onPdf={() => void exportPdf()} onExcel={() => void exportExcel()} />
          ) : null}

          {view === "teoria" ? <TheoryView /> : null}
        </main>
      </div>

      {projectPanel ? (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProjectPanel(false); }}>
          <section className="project-drawer" role="dialog" aria-modal="true" aria-label="Mis proyectos">
            <div className="drawer-heading"><div><span className="eyebrow">CUENTA DE {user?.displayName.toUpperCase()}</span><h2>Mis proyectos guardados</h2></div><button type="button" onClick={() => setProjectPanel(false)}>×</button></div>
            {projectLoading ? <div className="loading-state">Cargando proyectos…</div> : savedProjects.length ? (
              <div className="saved-projects">{savedProjects.map((project) => <article key={project.id}><div><b>{project.name}</b><span>{project.data.nodes.length} nodos · {project.data.elements.length} barras</span><small>Actualizado: {new Date(project.updatedAt).toLocaleString("es-PE")}</small></div><div><button type="button" className="primary small" onClick={() => loadSavedProject(project)}>Abrir</button><button type="button" className="danger-text" onClick={() => void deleteSavedProject(project.id)}>Eliminar</button></div></article>)}</div>
            ) : <div className="empty-state"><b>Aún no hay proyectos guardados</b><p>Edita un ejemplo o crea tu propia estructura y pulsa Guardar.</p></div>}
          </section>
        </div>
      ) : null}

      <input ref={jsonInput} type="file" hidden accept=".json" onChange={importJson} />
      <button className="floating-import" type="button" onClick={() => jsonInput.current?.click()} title="Importar proyecto JSON">↑ Importar JSON</button>
    </div>
  );
}

function EmptyAnalysis({ analysis, dirty, onCalculate }: { analysis: AnalysisOutput; dirty: boolean; onCalculate: () => void }) {
  return (
    <section className="analysis-empty">
      <span>{dirty ? "↻" : "!"}</span>
      <h2>{dirty ? "El modelo cambió" : "No se puede mostrar el procedimiento"}</h2>
      <p>{dirty ? "Ejecuta nuevamente el cálculo para actualizar todas las matrices y resultados." : !analysis.ok ? analysis.errors.join(" ") : ""}</p>
      <button type="button" className="primary" onClick={onCalculate}>Calcular ahora</button>
    </section>
  );
}

function ProcedureView({
  model,
  analysis,
  dirty,
  selectedElementId,
  setSelectedElementId,
  selectedElement,
  stiffnessUnit,
  stiffnessTransform,
  onCalculate,
}: {
  model: TrussModel;
  analysis: AnalysisOutput;
  dirty: boolean;
  selectedElementId: string;
  setSelectedElementId: (id: string) => void;
  selectedElement: AnalysisResult["elementResults"][number] | null;
  stiffnessUnit: string;
  stiffnessTransform: (value: number) => number;
  onCalculate: () => void;
}) {
  if (dirty || !analysis.ok) return <EmptyAnalysis analysis={analysis} dirty={dirty} onCalculate={onCalculate} />;
  const result = analysis;
  return (
    <>
      <section className="workspace-heading procedure-heading"><div><span className="eyebrow">DESARROLLO NUMÉRICO COMPLETO</span><h1>Procedimiento del método de rigidez</h1><p>Revisa cada operación desde los datos de entrada hasta la verificación final.</p></div><div className="analysis-badge"><span>27</span><div><b>etapas disponibles</b><small>Resultados en {model.units.force}, {model.units.length} y {model.units.stress}</small></div></div></section>
      <div className="procedure-layout">
        <aside className="review-index"><span className="eyebrow">ÍNDICE DE REVISIÓN</span><ol>{reviewItems.map((item, index) => <li key={item}><a href={`#review-${Math.min(8, Math.floor(index / 4))}`}><span>{String(index + 1).padStart(2, "0")}</span>{item}<i>✓</i></a></li>)}</ol></aside>
        <div className="procedure-content">
          <ProcedureSection id="review-0" number="01" title="Datos, geometría y numeración" subtitle="Entradas originales y asignación automática de grados de libertad">
            <div className="split-tables">
              <div><h3>Nodos y coordenadas</h3><div className="data-table-scroll"><table className="data-table readonly"><thead><tr><th>Nodo</th><th>X</th><th>Y</th><th>GDL X</th><th>GDL Y</th></tr></thead><tbody>{model.nodes.map((node, index) => <tr key={node.id}><td><b>{node.label}</b></td><td>{formatNumber(node.x)} {model.units.length}</td><td>{formatNumber(node.y)} {model.units.length}</td><td>{2 * index + 1}</td><td>{2 * index + 2}</td></tr>)}</tbody></table></div></div>
              <div><h3>Elementos y propiedades</h3><div className="data-table-scroll"><table className="data-table readonly"><thead><tr><th>Elem.</th><th>i → j</th><th>A</th><th>E</th></tr></thead><tbody>{model.elements.map((element) => <tr key={element.id}><td><b>E{element.label}</b></td><td>{model.nodes.find((n) => n.id === element.nodeI)?.label} → {model.nodes.find((n) => n.id === element.nodeJ)?.label}</td><td>{formatNumber(element.area)} {model.units.area}</td><td>{formatNumber(element.elasticModulus)} {model.units.stress}</td></tr>)}</tbody></table></div></div>
            </div>
          </ProcedureSection>

          <ProcedureSection id="review-1" number="02" title="Longitudes y cosenos directores" subtitle="L = √[(xj−xi)²+(yj−yi)²], c = Δx/L, s = Δy/L">
            <div className="data-table-scroll"><table className="data-table readonly"><thead><tr><th>Elemento</th><th>L ({model.units.length})</th><th>c = cos θ</th><th>s = sin θ</th><th>θ</th><th>GDL</th></tr></thead><tbody>{result.elementResults.map((element) => <tr key={element.id}><td><b>E{element.label}</b></td><td>{formatNumber(displacementFromSI(element.length, model.units), 6)}</td><td>{formatNumber(element.cosine, 7)}</td><td>{formatNumber(element.sine, 7)}</td><td>{formatNumber(element.angleDegrees, 4)}°</td><td>[{element.dofs.join(", ")}]</td></tr>)}</tbody></table></div>
          </ProcedureSection>

          <ProcedureSection id="review-2" number="03" title="Matrices de cada elemento" subtitle="Transformación, rigidez local axial y rigidez del elemento en coordenadas globales">
            <label className="element-selector"><span>Elemento seleccionado</span><select value={selectedElementId} onChange={(event) => setSelectedElementId(event.target.value)}>{result.elementResults.map((element) => <option key={element.id} value={element.id}>Elemento {element.label}</option>)}</select></label>
            {selectedElement ? <div className="matrix-grid"><div><h3>Matriz de transformación T (2×4)</h3><p className="formula">u′ = T · uᵉ</p><MatrixView matrix={selectedElement.transform} unit="adimensional" /></div><div><h3>Matriz local expandida k′ (4×4)</h3><p className="formula">k′ = (AE/L) · matriz axial</p><MatrixView matrix={selectedElement.localExpandedStiffness} unit={stiffnessUnit} transform={stiffnessTransform} /></div><div className="wide"><h3>Matriz global del elemento kᵉ (4×4)</h3><p className="formula">kᵉ = T̄ᵀ k′ T̄</p><MatrixView matrix={selectedElement.globalStiffness} unit={stiffnessUnit} transform={stiffnessTransform} /></div></div> : null}
          </ProcedureSection>

          <ProcedureSection id="review-3" number="04" title="GDL, restricciones y vector global de cargas" subtitle="Orden global: [u1x, u1y, u2x, u2y, …]">
            <div className="dof-summary"><div><span>Libres</span><b>[{result.freeDofs.join(", ")}]</b></div><div><span>Restringidos</span><b>[{result.restrainedDofs.join(", ")}]</b></div><div><span>Total</span><b>{result.ndof} GDL</b></div></div>
            <VectorTable values={result.forceVector} transform={(value) => forceFromSI(value, model.units)} unit={model.units.force} label="F" />
          </ProcedureSection>

          <ProcedureSection id="review-4" number="05" title="Proceso de ensamblaje" subtitle="Cada kᵉ se suma en K según el mapa de GDL del elemento">
            <div className="assembly-list">{result.assemblySteps.map((step, index) => <details key={step.elementId} open={index === 0}><summary><span>0{index + 1}</span><b>Elemento {step.elementLabel}</b><small>K[{step.dofs.join(", ")}] += kᵉ</small></summary><MatrixView matrix={step.contribution} unit={stiffnessUnit} transform={stiffnessTransform} compact />{step.cumulative ? <details className="nested-detail"><summary>Matriz acumulada después de este elemento</summary><MatrixView matrix={step.cumulative} unit={stiffnessUnit} transform={stiffnessTransform} compact /></details> : <p className="muted">La matriz acumulada se omite en modelos mayores a 16 GDL para proteger el rendimiento; la contribución y el resultado global permanecen disponibles.</p>}</details>)}</div>
          </ProcedureSection>

          <ProcedureSection id="review-5" number="06" title="Matriz global antes de restricciones" subtitle={`K global de ${result.ndof} × ${result.ndof} en ${stiffnessUnit}`}>
            <MatrixView matrix={result.globalStiffness} unit={stiffnessUnit} transform={stiffnessTransform} />
          </ProcedureSection>

          <ProcedureSection id="review-6" number="07" title="Partición y sistema reducido" subtitle="[Kff Kfr; Krf Krr] · [Uf; Ur] = [Ff; Fr], con Ur = 0">
            <div className="matrix-grid partitions"><div><h3>Kff</h3><MatrixView matrix={result.kff} unit={stiffnessUnit} transform={stiffnessTransform} compact /></div><div><h3>Kfr</h3><MatrixView matrix={result.kfr} unit={stiffnessUnit} transform={stiffnessTransform} compact /></div><div><h3>Krf</h3><MatrixView matrix={result.krf} unit={stiffnessUnit} transform={stiffnessTransform} compact /></div><div><h3>Krr</h3><MatrixView matrix={result.krr} unit={stiffnessUnit} transform={stiffnessTransform} compact /></div></div>
            <div className="reduced-equation"><span>Kff</span><b>·</b><span>Uf</span><b>=</b><span>Ff</span><i>Solución por eliminación gaussiana con pivoteo parcial · razón de pivotes {formatNumber(result.solver.pivotRatio, 7)}</i></div>
          </ProcedureSection>

          <ProcedureSection id="review-7" number="08" title="Desplazamientos, reacciones y respuesta axial" subtitle="Recuperación de U, R = KU − F y fuerzas internas por elemento">
            <div className="split-tables"><VectorTable values={result.displacements} transform={(value) => displacementFromSI(value, model.units)} unit={model.units.length} label="U" /><VectorTable values={result.reactions} transform={(value) => forceFromSI(value, model.units)} unit={model.units.force} label="R" /></div>
            <div className="data-table-scroll"><table className="data-table readonly"><thead><tr><th>Elem.</th><th>ΔL ({model.units.length})</th><th>ε</th><th>σ ({model.units.stress})</th><th>N ({model.units.force})</th><th>Estado</th></tr></thead><tbody>{result.elementResults.map((element) => <tr key={element.id}><td><b>E{element.label}</b></td><td>{formatNumber(displacementFromSI(element.axialDeformation, model.units), 7)}</td><td>{formatNumber(element.strain, 8)}</td><td>{formatNumber(stressFromSI(element.stress, model.units), 6)}</td><td>{formatNumber(forceFromSI(element.axialForce, model.units), 6)}</td><td><span className={`force-state ${element.classification.toLowerCase().replace("ó", "o")}`}>{element.classification}</span></td></tr>)}</tbody></table></div>
          </ProcedureSection>

          <ProcedureSection id="review-8" number="09" title="Comprobación del equilibrio" subtitle="Suma de cargas aplicadas y reacciones; momentos respecto del origen global">
            <EquilibriumPanel model={model} result={result} />
          </ProcedureSection>
        </div>
      </div>
    </>
  );
}

function ProcedureSection({ id, number, title, subtitle, children }: { id: string; number: string; title: string; subtitle: string; children: React.ReactNode }) {
  return <section id={id} className="procedure-section"><header><span>{number}</span><div><h2>{title}</h2><p>{subtitle}</p></div></header><div className="procedure-section-body">{children}</div></section>;
}

function VectorTable({ values, transform, unit, label }: { values: number[]; transform: (value: number) => number; unit: string; label: string }) {
  return <div className="vector-table"><h3>Vector {label}</h3><div className="vector-values">{values.map((value, index) => <div key={index}><span>{label}<sub>{index + 1}</sub></span><b>{formatNumber(transform(value), 7)}</b><small>{unit}</small></div>)}</div></div>;
}

function ResultsView({ model, analysis, dirty, deformationScale, setDeformationScale, visual, onCalculate, onPdf, onExcel }: { model: TrussModel; analysis: AnalysisOutput; dirty: boolean; deformationScale: number; setDeformationScale: (value: number) => void; visual: { nodes: boolean; nodeLabels: boolean; elementLabels: boolean; supports: boolean; forces: boolean; localAxes: boolean; lengths: boolean; deformed: boolean }; onCalculate: () => void; onPdf: () => void; onExcel: () => void }) {
  if (dirty || !analysis.ok) return <EmptyAnalysis analysis={analysis} dirty={dirty} onCalculate={onCalculate} />;
  const result = analysis;
  return <>
    <section className="workspace-heading results-heading"><div><span className="eyebrow">RESULTADOS DEL ANÁLISIS</span><h1>{model.project.name}</h1><p>Respuesta lineal elástica de la armadura y verificación numérica.</p></div><div className="heading-actions"><button type="button" className="secondary" onClick={onExcel}>Descargar Excel</button><button type="button" className="primary" onClick={onPdf}>Descargar informe PDF</button></div></section>
    <div className="kpi-grid">
      <article><span>Desplazamiento máximo</span><b>{formatNumber(displacementFromSI(result.maxDisplacement, model.units), 6)} <small>{model.units.length}</small></b><i>max √(Ux²+Uy²)</i></article>
      <article><span>Fuerza axial máxima</span><b>{formatNumber(Math.max(...result.elementResults.map((e) => Math.abs(forceFromSI(e.axialForce, model.units)))), 5)} <small>{model.units.force}</small></b><i>valor absoluto</i></article>
      <article><span>GDL resueltos</span><b>{result.freeDofs.length} <small>libres</small></b><i>{result.restrainedDofs.length} restringidos</i></article>
      <article className={result.equilibrium.passed ? "passed" : "failed"}><span>Equilibrio global</span><b>{result.equilibrium.passed ? "CUMPLE" : "REVISAR"}</b><i>residual {formatNumber(result.equilibrium.relativeResidual, 8)}</i></article>
    </div>
    <div className="results-grid">
      <section className="visual-card result-visual"><div className="card-title"><div><span className="eyebrow">ESTRUCTURA DEFORMADA</span><h2>Respuesta gráfica</h2></div><span className="live-pill">Calculado</span></div><TrussCanvas model={model} result={result} deformationScale={deformationScale} {...{ showNodes: visual.nodes, showNodeLabels: visual.nodeLabels, showElementLabels: visual.elementLabels, showSupports: visual.supports, showForces: visual.forces, showLocalAxes: false, showLengths: false, showDeformed: true }} nodePlacementMode={false} snapEnabled={false} snapStep={1} onAddNode={() => undefined} /><label className="scale-control"><span>Amplificación visual</span><input type="range" min="1" max="1000" value={deformationScale} onChange={(event) => setDeformationScale(Number(event.target.value))} /><output>×{deformationScale}</output></label></section>
      <section className="result-table-card"><div className="card-title"><div><span className="eyebrow">RESPUESTA NODAL</span><h2>Desplazamientos y reacciones</h2></div></div><div className="data-table-scroll"><table className="data-table readonly"><thead><tr><th>Nodo</th><th>Ux ({model.units.length})</th><th>Uy ({model.units.length})</th><th>Rx ({model.units.force})</th><th>Ry ({model.units.force})</th></tr></thead><tbody>{model.nodes.map((node, index) => <tr key={node.id}><td><b>{node.label}</b></td><td>{formatNumber(displacementFromSI(result.displacements[2 * index], model.units), 7)}</td><td>{formatNumber(displacementFromSI(result.displacements[2 * index + 1], model.units), 7)}</td><td>{formatNumber(forceFromSI(result.reactions[2 * index], model.units), 6)}</td><td>{formatNumber(forceFromSI(result.reactions[2 * index + 1], model.units), 6)}</td></tr>)}</tbody></table></div><div className="card-title sub"><div><span className="eyebrow">RESPUESTA DE BARRAS</span><h2>Fuerza axial y esfuerzo</h2></div></div><div className="data-table-scroll"><table className="data-table readonly"><thead><tr><th>Elem.</th><th>N ({model.units.force})</th><th>σ ({model.units.stress})</th><th>ε</th><th>Estado</th></tr></thead><tbody>{result.elementResults.map((element) => <tr key={element.id}><td><b>E{element.label}</b></td><td>{formatNumber(forceFromSI(element.axialForce, model.units), 6)}</td><td>{formatNumber(stressFromSI(element.stress, model.units), 6)}</td><td>{formatNumber(element.strain, 8)}</td><td><span className={`force-state ${element.classification.toLowerCase().replace("ó", "o")}`}>{element.classification}</span></td></tr>)}</tbody></table></div></section>
    </div>
    <EquilibriumPanel model={model} result={result} />
    <section className="export-banner"><div><span className="eyebrow">DOCUMENTACIÓN TÉCNICA</span><h2>Exporta todo el procedimiento</h2><p>El PDF incluye entradas, matrices por elemento, ensamblaje, particiones, resultados y equilibrio. El Excel organiza cada bloque en hojas independientes.</p></div><div><button type="button" className="secondary" onClick={onExcel}>Excel .xlsx</button><button type="button" className="primary" onClick={onPdf}>Informe PDF</button></div></section>
  </>;
}

function EquilibriumPanel({ model, result }: { model: TrussModel; result: AnalysisResult }) {
  const rows = [
    ["Eje X", result.equilibrium.externalX, result.equilibrium.reactionX, result.equilibrium.residualX, model.units.force],
    ["Eje Y", result.equilibrium.externalY, result.equilibrium.reactionY, result.equilibrium.residualY, model.units.force],
    ["Momento O", result.equilibrium.externalMoment, result.equilibrium.reactionMoment, result.equilibrium.residualMoment, `${model.units.force}·${model.units.length}`],
  ] as const;
  return <section className={`equilibrium-card ${result.equilibrium.passed ? "passed" : "failed"}`}><div className="equilibrium-status"><span>{result.equilibrium.passed ? "✓" : "!"}</span><div><small>COMPROBACIÓN DEL EQUILIBRIO</small><h2>{result.equilibrium.passed ? "El sistema está en equilibrio" : "Revise el modelo"}</h2><p>Residual relativo máximo: {formatNumber(result.equilibrium.relativeResidual, 10)}</p></div></div><div className="equilibrium-rows">{rows.map(([label, applied, reaction, residual, unit]) => { const isMoment = label === "Momento O"; const convert = (value: number) => isMoment ? value / (LENGTH_TO_M[model.units.length] * FORCE_TO_N[model.units.force]) : forceFromSI(value, model.units); return <div key={label}><b>{label}</b><span><small>Aplicada</small>{formatNumber(convert(applied), 7)} {unit}</span><span><small>Reacción</small>{formatNumber(convert(reaction), 7)} {unit}</span><span><small>Residual</small>{formatNumber(convert(residual), 9)} {unit}</span></div>; })}</div></section>;
}

function TheoryView() {
  return <>
    <section className="workspace-heading theory-heading"><div><span className="eyebrow">BASE TEÓRICA</span><h1>Método matricial de rigidez</h1><p>Fundamentos, hipótesis, formulación y criterios de verificación para armaduras planas.</p></div><a className="secondary" href="#references">Fuentes técnicas ↓</a></section>
    <div className="theory-layout">
      <aside className="theory-index"><span className="eyebrow">CONTENIDO</span><a href="#scope">1. Alcance</a><a href="#dof">2. GDL y cinemática</a><a href="#element">3. Elemento de armadura</a><a href="#transform">4. Transformación</a><a href="#assembly">5. Ensamblaje</a><a href="#boundary">6. Condiciones de borde</a><a href="#response">7. Recuperación</a><a href="#stability">8. Estabilidad</a><a href="#units">9. Unidades</a><a href="#references">10. Fuentes</a></aside>
      <article className="theory-article">
        <section id="scope"><span className="chapter">01</span><h2>Alcance e hipótesis</h2><p>La aplicación analiza armaduras planas formadas por barras rectas unidas mediante articulaciones ideales. Cada nodo posee dos desplazamientos traslacionales y cada barra trabaja únicamente a esfuerzo axial.</p><div className="assumption-grid"><div><b>Linealidad</b><span>Material elástico lineal y pequeñas deformaciones.</span></div><div><b>Nudos articulados</b><span>No se transmite momento entre barras.</span></div><div><b>Cargas nodales</b><span>Las acciones se aplican en los nodos.</span></div><div><b>Sección constante</b><span>A y E son constantes dentro de cada elemento.</span></div></div><div className="warning-note"><b>Importante</b><p>No sustituye la revisión profesional ni comprueba pandeo, fluencia, conexiones, segundo orden, dinámica o normas de diseño.</p></div></section>
        <section id="dof"><span className="chapter">02</span><h2>Grados de libertad y vector de desplazamientos</h2><p>Para n nodos, el sistema posee 2n GDL. La numeración implementada es consecutiva:</p><div className="formula-block"><span>u = [u₁ₓ, u₁ᵧ, u₂ₓ, u₂ᵧ, …, uₙₓ, uₙᵧ]ᵀ</span><small>GDL del nodo i: 2i−1 en X y 2i en Y.</small></div></section>
        <section id="element"><span className="chapter">03</span><h2>Rigidez axial del elemento</h2><p>La longitud, los cosenos directores y la rigidez axial se obtienen a partir de la geometría y las propiedades de cada barra:</p><div className="formula-row"><div>L = √(Δx² + Δy²)</div><div>c = Δx/L</div><div>s = Δy/L</div><div>k = AE/L</div></div><p>En el sistema local axial de dos grados de libertad:</p><div className="formula-block matrix-formula"><span>k′ = AE/L · [ 1  −1 ; −1  1 ]</span></div></section>
        <section id="transform"><span className="chapter">04</span><h2>Transformación local–global</h2><p>La matriz T proyecta los desplazamientos globales de los extremos sobre el eje local de la barra:</p><div className="formula-block matrix-formula"><span>T = [ c  s  0  0 ; 0  0  c  s ]</span><small>u′ = T uᵉ · kᵉ = Tᵀ k′ T</small></div><p>Al expandir la operación se obtiene la matriz global de 4×4 con los términos c², s² y cs que muestra la aplicación para cada elemento.</p></section>
        <section id="assembly"><span className="chapter">05</span><h2>Ensamblaje global</h2><p>Cada matriz elemental se suma en las filas y columnas globales correspondientes a sus cuatro GDL. Las contribuciones coincidentes se acumulan:</p><div className="formula-block"><span>K[Iₑ, Iₑ] ← K[Iₑ, Iₑ] + kᵉ</span><small>Iₑ = [2i−1, 2i, 2j−1, 2j]</small></div><p>El resultado es una matriz K simétrica. Antes de imponer apoyos puede ser semidefinida positiva debido a los movimientos de cuerpo rígido.</p></section>
        <section id="boundary"><span className="chapter">06</span><h2>Restricciones y sistema reducido</h2><p>Separando los grados libres f de los restringidos r:</p><div className="formula-block matrix-formula"><span>[Kff Kfr; Krf Krr] [Uf; Ur] = [Ff; Fr]</span><small>Para apoyos sin desplazamiento prescrito: Ur = 0 → Kff Uf = Ff.</small></div><p>La aplicación resuelve Kff con eliminación gaussiana y pivoteo parcial. Si un pivote es casi nulo, informa que existe inestabilidad o mal condicionamiento.</p></section>
        <section id="response"><span className="chapter">07</span><h2>Desplazamientos, reacciones y fuerzas internas</h2><div className="formula-row three"><div>R = KU − F</div><div>δ = [−c −s c s]uᵉ</div><div>ε = δ/L</div><div>σ = Eε</div><div>N = Aσ = AEδ/L</div><div>N &gt; 0: tracción</div></div><p>La estructura deformada se dibuja como xᵈ = x + αU, donde α es una amplificación visual que no cambia los resultados numéricos.</p></section>
        <section id="stability"><span className="chapter">08</span><h2>Estabilidad y comprobaciones</h2><p>El criterio m + r ≥ 2j es una revisión preliminar para una armadura plana, pero no garantiza estabilidad geométrica. La prueba determinante de esta aplicación es la resolubilidad de Kff.</p><ul><li>Longitud cero, áreas o módulos no positivos: error crítico.</li><li>Conexiones duplicadas o nodos inexistentes: error crítico.</li><li>Matriz singular: mecanismo, apoyo insuficiente o barra desconectada.</li><li>Equilibrio: ΣFx = 0, ΣFy = 0 y ΣMO = 0 dentro de tolerancia numérica.</li></ul></section>
        <section id="units"><span className="chapter">09</span><h2>Control de unidades</h2><p>Los datos se convierten a metros, newtons y pascales antes del cálculo. Después se expresan nuevamente en las unidades seleccionadas. Así, A, E, coordenadas y cargas nunca se combinan de forma incompatible.</p><div className="unit-reference"><span>1 kgf = 9.80665 N</span><span>1 tf = 9.80665 kN</span><span>1 MPa = 10⁶ Pa</span><span>1 GPa = 10⁹ Pa</span><span>1 cm² = 10⁻⁴ m²</span><span>1 kN/cm² = 10 MPa</span></div></section>
        <section id="references"><span className="chapter">10</span><h2>Fuentes técnicas consultadas</h2><p>La formulación y el flujo de solución se contrastaron con recursos académicos y documentación de software estructural:</p><div className="reference-list"><a href="https://ocw.mit.edu/courses/3-11-mechanics-of-materials-fall-1999/resources/mit3_11f99_truss/" target="_blank" rel="noreferrer"><b>MIT OpenCourseWare — Trusses</b><span>Ensamblaje, solución de desplazamientos y recuperación de fuerzas.</span></a><a href="https://ocw.mit.edu/courses/3-91-mechanical-behavior-of-plastics-spring-2007/resources/18_fea/" target="_blank" rel="noreferrer"><b>MIT OpenCourseWare — Finite Element Analysis</b><span>Relación entre el método matricial de armaduras y elementos finitos.</span></a><a href="https://opensees.berkeley.edu/OpenSees/manuals/usermanual/10.htm" target="_blank" rel="noreferrer"><b>OpenSees — Truss Element</b><span>Definición del elemento por nodos, área y material axial.</span></a></div></section>
      </article>
    </div>
  </>;
}
