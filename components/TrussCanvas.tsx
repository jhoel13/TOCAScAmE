"use client";

import { useMemo, useRef, useState } from "react";
import type { AnalysisResult, TrussModel } from "@/lib/truss";
import { displacementFromSI, formatNumber } from "@/lib/format";

type Props = {
  model: TrussModel;
  result: AnalysisResult | null;
  deformationScale: number;
  showNodes: boolean;
  showNodeLabels: boolean;
  showElementLabels: boolean;
  showSupports: boolean;
  showForces: boolean;
  showLocalAxes: boolean;
  showLengths: boolean;
  showDeformed: boolean;
  nodePlacementMode: boolean;
  snapEnabled: boolean;
  snapStep: number;
  onAddNode: (x: number, y: number) => void;
};

const WIDTH = 820;
const HEIGHT = 500;
const PADDING = 78;

export function TrussCanvas({
  model,
  result,
  deformationScale,
  showNodes,
  showNodeLabels,
  showElementLabels,
  showSupports,
  showForces,
  showLocalAxes,
  showLengths,
  showDeformed,
  nodePlacementMode,
  snapEnabled,
  snapStep,
  onAddNode,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; px: number; py: number } | null>(null);
  const nodeById = useMemo(() => new Map(model.nodes.map((node) => [node.id, node])), [model.nodes]);
  const bounds = useMemo(() => {
    if (!model.nodes.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    const xs = model.nodes.map((node) => node.x);
    const ys = model.nodes.map((node) => node.y);
    let minX = Math.min(...xs);
    let maxX = Math.max(...xs);
    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);
    if (Math.abs(maxX - minX) < 1e-9) {
      minX -= 1;
      maxX += 1;
    }
    if (Math.abs(maxY - minY) < 1e-9) {
      minY -= 1;
      maxY += 1;
    }
    return { minX, maxX, minY, maxY };
  }, [model.nodes]);

  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  const baseScale = Math.min(
    (WIDTH - 2 * PADDING) / Math.max(bounds.maxX - bounds.minX, 1e-6),
    (HEIGHT - 2 * PADDING) / Math.max(bounds.maxY - bounds.minY, 1e-6),
  );
  const scale = baseScale * zoom;
  const screen = (x: number, y: number) => ({
    x: WIDTH / 2 + (x - midX) * scale + pan.x,
    y: HEIGHT / 2 - (y - midY) * scale + pan.y,
  });
  const modelPoint = (x: number, y: number) => ({
    x: midX + (x - WIDTH / 2 - pan.x) / scale,
    y: midY - (y - HEIGHT / 2 - pan.y) / scale,
  });

  const center = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const pointerCoordinates = (event: React.PointerEvent<SVGSVGElement>) => {
    const rectangle = svgRef.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - rectangle.left) / rectangle.width) * WIDTH,
      y: ((event.clientY - rectangle.top) / rectangle.height) * HEIGHT,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = pointerCoordinates(event);
    if (nodePlacementMode) {
      let coordinate = modelPoint(point.x, point.y);
      if (snapEnabled && snapStep > 0) {
        coordinate = {
          x: Math.round(coordinate.x / snapStep) * snapStep,
          y: Math.round(coordinate.y / snapStep) * snapStep,
        };
      }
      onAddNode(coordinate.x, coordinate.y);
      return;
    }
    dragRef.current = { pointerId: event.pointerId, x: point.x, y: point.y, px: pan.x, py: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const point = pointerCoordinates(event);
    setPan({
      x: dragRef.current.px + point.x - dragRef.current.x,
      y: dragRef.current.py + point.y - dragRef.current.y,
    });
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const gridLines = Array.from({ length: 17 }, (_, index) => ({
    x: (index * WIDTH) / 16,
    y: (index * HEIGHT) / 16,
  }));

  const maxLoad = Math.max(1e-12, ...model.nodes.flatMap((node) => [Math.abs(node.fx), Math.abs(node.fy)]));

  return (
    <div className={`canvas-shell ${nodePlacementMode ? "placing" : ""}`}>
      <div className="canvas-toolbar" aria-label="Controles del plano">
        <button type="button" onClick={() => setZoom((value) => Math.min(4, value * 1.2))} aria-label="Acercar">＋</button>
        <button type="button" onClick={() => setZoom((value) => Math.max(0.35, value / 1.2))} aria-label="Alejar">−</button>
        <button type="button" onClick={center}>Centrar</button>
        <span>{Math.round(zoom * 100)}%</span>
      </div>
      {nodePlacementMode ? (
        <div className="canvas-hint">Haz clic para crear un nodo{snapEnabled ? ` · SNAP ${snapStep} ${model.units.length}` : ""}</div>
      ) : null}
      <svg
        ref={svgRef}
        className="truss-canvas"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Vista interactiva de la armadura"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={(event) => {
          event.preventDefault();
          setZoom((value) => Math.max(0.35, Math.min(4, value * (event.deltaY < 0 ? 1.1 : 0.9))));
        }}
      >
        <defs>
          <marker id="force-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" className="force-arrow-head" />
          </marker>
          <marker id="axis-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" className="axis-arrow-head" />
          </marker>
          <filter id="node-shadow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.25" />
          </filter>
        </defs>

        <rect x="0" y="0" width={WIDTH} height={HEIGHT} className="canvas-background" />
        <g className="grid-lines">
          {gridLines.map((line, index) => (
            <g key={index}>
              <line x1={line.x} y1="0" x2={line.x} y2={HEIGHT} />
              <line x1="0" y1={line.y} x2={WIDTH} y2={line.y} />
            </g>
          ))}
        </g>

        {(() => {
          const origin = screen(0, 0);
          return (
            <g className="global-axes">
              <line x1={origin.x - 34} y1={origin.y} x2={origin.x + 54} y2={origin.y} markerEnd="url(#axis-arrow)" />
              <line x1={origin.x} y1={origin.y + 34} x2={origin.x} y2={origin.y - 54} markerEnd="url(#axis-arrow)" />
              <text x={origin.x + 58} y={origin.y + 5}>X</text>
              <text x={origin.x + 7} y={origin.y - 57}>Y</text>
            </g>
          );
        })()}

        <g className="original-structure">
          {model.elements.map((element, elementIndex) => {
            const nodeI = nodeById.get(element.nodeI);
            const nodeJ = nodeById.get(element.nodeJ);
            if (!nodeI || !nodeJ) return null;
            const a = screen(nodeI.x, nodeI.y);
            const b = screen(nodeJ.x, nodeJ.y);
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const length = Math.hypot(nodeJ.x - nodeI.x, nodeJ.y - nodeI.y);
            const angle = (Math.atan2(nodeJ.y - nodeI.y, nodeJ.x - nodeI.x) * 180) / Math.PI;
            const elementResult = result?.elementResults[elementIndex];
            const className = elementResult
              ? elementResult.classification === "Tracción"
                ? "element tension"
                : elementResult.classification === "Compresión"
                  ? "element compression"
                  : "element neutral"
              : "element";
            return (
              <g key={element.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={className} />
                {showElementLabels ? (
                  <g className="element-label" transform={`translate(${mid.x} ${mid.y})`}>
                    <rect x="-13" y="-12" width="26" height="20" rx="6" />
                    <text textAnchor="middle" y="3">E{element.label}</text>
                  </g>
                ) : null}
                {showLengths ? (
                  <text className="length-label" x={mid.x} y={mid.y + 22} textAnchor="middle">
                    L={formatNumber(length, 4)} {model.units.length} · θ={formatNumber(angle, 2)}°
                  </text>
                ) : null}
                {showLocalAxes ? (
                  <g className="local-axis">
                    <line x1={mid.x} y1={mid.y} x2={mid.x + (b.x - a.x) * 0.16} y2={mid.y + (b.y - a.y) * 0.16} markerEnd="url(#axis-arrow)" />
                    <text x={mid.x + (b.x - a.x) * 0.18} y={mid.y + (b.y - a.y) * 0.18 - 4}>x′</text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </g>

        {showDeformed && result ? (
          <g className="deformed-structure">
            {model.elements.map((element) => {
              const nodeI = nodeById.get(element.nodeI)!;
              const nodeJ = nodeById.get(element.nodeJ)!;
              const indexI = model.nodes.findIndex((node) => node.id === nodeI.id);
              const indexJ = model.nodes.findIndex((node) => node.id === nodeJ.id);
              const a = screen(
                nodeI.x + displacementFromSI(result.displacements[2 * indexI], model.units) * deformationScale,
                nodeI.y + displacementFromSI(result.displacements[2 * indexI + 1], model.units) * deformationScale,
              );
              const b = screen(
                nodeJ.x + displacementFromSI(result.displacements[2 * indexJ], model.units) * deformationScale,
                nodeJ.y + displacementFromSI(result.displacements[2 * indexJ + 1], model.units) * deformationScale,
              );
              return <line key={element.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="deformed-element" />;
            })}
          </g>
        ) : null}

        {showSupports ? (
          <g className="supports">
            {model.nodes.map((node) => {
              if (!node.restraintX && !node.restraintY) return null;
              const point = screen(node.x, node.y);
              if (node.restraintX && node.restraintY) {
                return (
                  <g key={node.id} transform={`translate(${point.x} ${point.y})`}>
                    <path d="M0 7 L-13 28 L13 28 Z" />
                    <line x1="-18" y1="31" x2="18" y2="31" />
                    {[-13, -5, 3, 11].map((x) => <line key={x} x1={x} y1="31" x2={x - 6} y2="38" />)}
                  </g>
                );
              }
              if (node.restraintY) {
                return (
                  <g key={node.id} transform={`translate(${point.x} ${point.y})`}>
                    <path d="M0 7 L-13 25 L13 25 Z" />
                    <circle cx="-7" cy="30" r="4" />
                    <circle cx="7" cy="30" r="4" />
                    <line x1="-18" y1="36" x2="18" y2="36" />
                  </g>
                );
              }
              return (
                <g key={node.id} transform={`translate(${point.x} ${point.y}) rotate(-90)`}>
                  <path d="M0 7 L-13 25 L13 25 Z" />
                  <circle cx="-7" cy="30" r="4" />
                  <circle cx="7" cy="30" r="4" />
                  <line x1="-18" y1="36" x2="18" y2="36" />
                </g>
              );
            })}
          </g>
        ) : null}

        {showForces ? (
          <g className="loads">
            {model.nodes.map((node) => {
              const point = screen(node.x, node.y);
              const arrows: React.ReactNode[] = [];
              if (Math.abs(node.fx) > 1e-12) {
                const length = 34 + 36 * (Math.abs(node.fx) / maxLoad);
                const direction = Math.sign(node.fx);
                arrows.push(
                  <g key="fx">
                    <line x1={point.x - direction * length} y1={point.y} x2={point.x - direction * 9} y2={point.y} markerEnd="url(#force-arrow)" />
                    <text x={point.x - direction * (length + 4)} y={point.y - 8} textAnchor={direction > 0 ? "end" : "start"}>Fx={formatNumber(node.fx)} {model.units.force}</text>
                  </g>,
                );
              }
              if (Math.abs(node.fy) > 1e-12) {
                const length = 34 + 36 * (Math.abs(node.fy) / maxLoad);
                const direction = Math.sign(node.fy);
                arrows.push(
                  <g key="fy">
                    <line x1={point.x} y1={point.y + direction * length} x2={point.x} y2={point.y + direction * 9} markerEnd="url(#force-arrow)" />
                    <text x={point.x + 9} y={point.y + direction * (length + 9)}>Fy={formatNumber(node.fy)} {model.units.force}</text>
                  </g>,
                );
              }
              return <g key={node.id}>{arrows}</g>;
            })}
          </g>
        ) : null}

        {showNodes ? (
          <g className="nodes">
            {model.nodes.map((node, index) => {
              const point = screen(node.x, node.y);
              return (
                <g key={node.id} transform={`translate(${point.x} ${point.y})`}>
                  <circle r="8" filter="url(#node-shadow)" />
                  <circle r="3" className="node-core" />
                  {showNodeLabels ? (
                    <g className="node-label" transform="translate(13 -18)">
                      <rect x="-4" y="-14" width={Math.max(34, node.label.length * 8 + 24)} height="24" rx="7" />
                      <text x="5" y="3">{node.label} · GDL {2 * index + 1},{2 * index + 2}</text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>
        ) : null}
      </svg>
      <div className="canvas-legend">
        <span><i className="legend-line original" /> Original</span>
        {result ? <span><i className="legend-line tension" /> Tracción</span> : null}
        {result ? <span><i className="legend-line compression" /> Compresión</span> : null}
        {showDeformed && result ? <span><i className="legend-line deformed" /> Deformada ×{deformationScale}</span> : null}
      </div>
      {result ? (
        <div className="canvas-result-chip">
          |U|max = {formatNumber(displacementFromSI(result.maxDisplacement, model.units), 6)} {model.units.length}
        </div>
      ) : null}
    </div>
  );
}
