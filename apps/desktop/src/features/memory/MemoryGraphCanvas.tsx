import { useRef, type CSSProperties, type PointerEvent, type WheelEvent } from "react";
import type {
  MemoryConsolidationState,
  MemoryGraph,
  MemoryGraphEdge,
  MemoryGraphNode,
  MemoryTraceType,
} from "@/lib/memory";

export type Point = {
  x: number;
  y: number;
};

type MemoryGraphCanvasProps = {
  depthByNodeId: Record<string, number>;
  focusTargetId: string | null;
  graph: MemoryGraph;
  pan: Point;
  selectedNodeId: string | null;
  selectedNodeTitle: string | null;
  zoom: number;
  workbenchView: "activation" | "consolidation" | "schema";
  onFitView: () => void;
  onPanChange: (pan: Point) => void;
  onFocusSelected: () => void;
  onSelectNode: (nodeId: string) => void;
  onWorkbenchViewChange: (view: "activation" | "consolidation" | "schema") => void;
  onZoomChange: (zoom: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

const kinds = ["workflow", "session", "agent", "message", "fact"];
export const canvasSize = { width: 960, height: 640 };
export const nodeSize = { width: 180, height: 112 };

export function MemoryGraphCanvas({
  depthByNodeId,
  focusTargetId,
  graph,
  pan,
  selectedNodeId,
  selectedNodeTitle,
  zoom,
  workbenchView,
  onFitView,
  onPanChange,
  onFocusSelected,
  onSelectNode,
  onWorkbenchViewChange,
  onZoomChange,
  onZoomIn,
  onZoomOut,
}: MemoryGraphCanvasProps) {
  const dragRef = useRef<{
    originPan: Point;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const layout = buildLayout(graph.nodes);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button")) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      originPan: pan,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return;
    }

    onPanChange({
      x: dragRef.current.originPan.x + (event.clientX - dragRef.current.startX),
      y: dragRef.current.originPan.y + (event.clientY - dragRef.current.startY),
    });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const nextZoom = clamp(zoom + (event.deltaY < 0 ? 0.08 : -0.08), 0.55, 1.8);
    onZoomChange(nextZoom);
  };

  return (
    <div
      aria-label="Memory graph canvas"
      className="memory-graph"
      data-focus-target-id={focusTargetId ?? ""}
      data-pan-x={String(pan.x)}
      data-pan-y={String(pan.y)}
      data-testid="memory-graph-canvas"
      data-zoom={String(zoom)}
      data-workbench-view={workbenchView}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      <div className="memory-graph__toolbar">
        <div className="memory-graph__focus-card">
          <span className="memory-graph__focus-label">Focus</span>
          <strong className="memory-graph__focus-value">
            {selectedNodeTitle ?? "Select a node"}
          </strong>
        </div>
        <div className="memory-graph__stats">
          <span>{graph.nodes.length} nodes</span>
          <span>{graph.edges.length} edges</span>
          <span>{Math.round(zoom * 100)}% zoom</span>
        </div>
      </div>

      <div className="memory-graph__dock memory-graph__dock--lens">
        <span className="memory-graph__dock-label">Lens</span>
        <div className="memory-graph__dock-actions">
          {[
            { label: "Activation", value: "activation" as const },
            { label: "Consolidation", value: "consolidation" as const },
            { label: "Schema", value: "schema" as const },
          ].map((option) => (
            <button
              aria-pressed={workbenchView === option.value}
              className={`memory-graph__chip${workbenchView === option.value ? " is-active" : ""}`}
              key={option.value}
              onClick={() => onWorkbenchViewChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="memory-graph__dock memory-graph__dock--viewport">
        <span className="memory-graph__dock-label">Viewport</span>
        <div className="memory-graph__dock-actions">
          <button className="memory-graph__chip" onClick={onZoomOut} type="button">
            Zoom out
          </button>
          <button className="memory-graph__chip" onClick={onZoomIn} type="button">
            Zoom in
          </button>
          <button className="memory-graph__chip" onClick={onFitView} type="button">
            Fit graph
          </button>
          <button
            className="memory-graph__chip is-accent"
            disabled={!selectedNodeTitle}
            onClick={onFocusSelected}
            type="button"
          >
            Focus selection
          </button>
        </div>
      </div>

      <div
        className="memory-graph__board"
        style={{
          height: `${canvasSize.height}px`,
          left: 0,
          position: "absolute",
          top: 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          width: `${canvasSize.width}px`,
        }}
      >
        <svg
          aria-hidden="true"
          height={canvasSize.height}
          style={{ inset: 0, overflow: "visible", pointerEvents: "none", position: "absolute" }}
          width={canvasSize.width}
        >
          {graph.edges.map((edge) => (
            <GraphEdge
              depth={Math.min(
                depthByNodeId[edge.sourceId] ?? 3,
                depthByNodeId[edge.targetId] ?? 3,
              )}
              edge={edge}
              key={edge.id}
              source={layout.get(edge.sourceId)}
              sourceNode={graph.nodes.find((node) => node.id === edge.sourceId)}
              target={layout.get(edge.targetId)}
              targetNode={graph.nodes.find((node) => node.id === edge.targetId)}
              workbenchView={workbenchView}
            />
          ))}
        </svg>

        {graph.nodes.map((node) => {
          const point = layout.get(node.id);
          if (!point) {
            return null;
          }

          const selected = node.id === selectedNodeId;
          const depth = depthByNodeId[node.id] ?? 3;
          const emphasis =
            depth === 0 ? "focus" : depth === 1 ? "neighbor" : depth === 2 ? "soft" : "muted";
          const presentation = nodePresentation(node, workbenchView, selected, depth);

          return (
            <button
              key={node.id}
              aria-label={`${node.title} memory node`}
              aria-pressed={selected}
              className="memory-graph__node"
              data-consolidation-state={node.consolidationState}
              data-node-depth={depth}
              data-node-emphasis={emphasis}
              data-node-shape="dot"
              data-trace-type={node.traceType}
              onClick={() => onSelectNode(node.id)}
              style={
                {
                  "--memory-node-background": presentation.background,
                  "--memory-node-badge-color": presentation.badgeColor,
                  "--memory-node-border": presentation.borderColor,
                  "--memory-node-eyebrow-color": presentation.eyebrowColor,
                  height: `${nodeSize.height}px`,
                  left: `${point.x}px`,
                  opacity: depth === 2 ? 0.74 : depth >= 3 ? 0.46 : 1,
                  top: `${point.y}px`,
                  width: `${nodeSize.width}px`,
                } as CSSProperties
              }
              type="button"
            >
              <span aria-hidden="true" className="memory-graph__node-dot" />
              <span className="memory-graph__node-label-stack">
                <span className="memory-graph__node-eyebrow">
                  {node.kind} · {node.traceType}
                </span>
                <span className="memory-graph__node-title">{node.title}</span>
              </span>
              <span className="memory-graph__node-badge">
                {workbenchView === "schema"
                  ? schemaLabel(node.traceType)
                  : node.consolidationState}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GraphEdge({
  depth,
  edge,
  source,
  sourceNode,
  target,
  targetNode,
  workbenchView,
}: {
  depth: number;
  edge: MemoryGraphEdge;
  source?: Point;
  sourceNode?: MemoryGraphNode;
  target?: Point;
  targetNode?: MemoryGraphNode;
  workbenchView: "activation" | "consolidation" | "schema";
}) {
  if (!source || !target) {
    return null;
  }

  const startX = source.x + nodeSize.width / 2;
  const startY = source.y + nodeSize.height / 2;
  const endX = target.x + nodeSize.width / 2;
  const endY = target.y + nodeSize.height / 2;
  const delta = Math.max(Math.abs(endX - startX) * 0.35, 80);
  const path = `M ${startX} ${startY} C ${startX + delta} ${startY}, ${endX - delta} ${endY}, ${endX} ${endY}`;
  const labelX = (startX + endX) / 2;
  const labelY = (startY + endY) / 2 - 14;

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={edgeStrokeColor(workbenchView, sourceNode, targetNode, depth)}
        strokeWidth={depth >= 2 ? "1.75" : "2.5"}
      />
      <text
        fill={depth >= 2 ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.58)"}
        fontSize="12"
        letterSpacing="1.2"
        textAnchor="middle"
        style={{ textTransform: "uppercase" }}
        x={labelX}
        y={labelY}
      >
        {edge.relation}
      </text>
    </g>
  );
}

export function buildLayout(nodes: MemoryGraphNode[]) {
  const counts = new Map<string, number>();
  const layout = new Map<string, Point>();

  for (const node of nodes) {
    const kind = kinds.includes(node.kind) ? node.kind : "fact";
    const column = kinds.indexOf(kind);
    const row = counts.get(kind) ?? 0;
    counts.set(kind, row + 1);

    layout.set(node.id, {
      x: 72 + column * 188,
      y: 108 + row * 132,
    });
  }

  return layout;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function nodePresentation(
  node: MemoryGraphNode,
  workbenchView: "activation" | "consolidation" | "schema",
  selected: boolean,
  depth: number,
) {
  const consolidation = consolidationPalette(node.consolidationState);
  const muted = depth >= 3;

  if (workbenchView === "consolidation") {
    return {
      background: selected
        ? consolidation.selectedBackground
        : muted
          ? consolidation.mutedBackground
          : consolidation.background,
      borderColor: selected ? consolidation.selectedBorder : consolidation.border,
      eyebrowColor: consolidation.eyebrowColor,
      badgeColor: consolidation.badgeColor,
    };
  }

  if (workbenchView === "schema") {
    const semantic = node.traceType === "semantic";
    return {
      background: semantic
        ? "rgba(222, 239, 229, 0.98)"
        : "rgba(247, 241, 233, 0.98)",
      borderColor: semantic ? "rgba(128, 170, 146, 0.72)" : "rgba(207, 192, 173, 0.78)",
      eyebrowColor: semantic ? "#58755f" : "#766d63",
      badgeColor: semantic ? "#58755f" : "#766d63",
    };
  }

  const kind = kindPalette(node.kind);

  return {
    background: selected
      ? kind.selectedBackground
      : muted
        ? kind.mutedBackground
        : kind.background,
    borderColor: selected ? kind.selectedBorder : kind.border,
    eyebrowColor: kind.eyebrowColor,
    badgeColor: kind.badgeColor,
  };
}

function kindPalette(kind: MemoryGraphNode["kind"]) {
  switch (kind) {
    case "workflow":
      return {
        background: "rgba(227, 236, 244, 0.98)",
        border: "rgba(137, 161, 184, 0.64)",
        selectedBackground: "rgba(216, 228, 239, 0.98)",
        selectedBorder: "rgba(118, 145, 169, 0.82)",
        mutedBackground: "rgba(227, 236, 244, 0.74)",
        eyebrowColor: "#556978",
        badgeColor: "#556978",
      };
    case "session":
      return {
        background: "rgba(244, 232, 214, 0.98)",
        border: "rgba(191, 162, 123, 0.64)",
        selectedBackground: "rgba(235, 221, 201, 0.98)",
        selectedBorder: "rgba(170, 140, 102, 0.82)",
        mutedBackground: "rgba(244, 232, 214, 0.74)",
        eyebrowColor: "#78624f",
        badgeColor: "#78624f",
      };
    case "agent":
      return {
        background: "rgba(230, 238, 228, 0.98)",
        border: "rgba(136, 165, 128, 0.64)",
        selectedBackground: "rgba(220, 230, 217, 0.98)",
        selectedBorder: "rgba(115, 145, 108, 0.82)",
        mutedBackground: "rgba(230, 238, 228, 0.74)",
        eyebrowColor: "#576c54",
        badgeColor: "#576c54",
      };
    case "message":
      return {
        background: "rgba(243, 225, 220, 0.98)",
        border: "rgba(186, 142, 132, 0.64)",
        selectedBackground: "rgba(235, 214, 208, 0.98)",
        selectedBorder: "rgba(165, 121, 111, 0.82)",
        mutedBackground: "rgba(243, 225, 220, 0.74)",
        eyebrowColor: "#7a5d55",
        badgeColor: "#7a5d55",
      };
    case "fact":
    default:
      return {
        background: "rgba(241, 231, 220, 0.98)",
        border: "rgba(183, 151, 125, 0.62)",
        selectedBackground: "rgba(233, 220, 206, 0.98)",
        selectedBorder: "rgba(163, 131, 105, 0.82)",
        mutedBackground: "rgba(241, 231, 220, 0.74)",
        eyebrowColor: "#735f4d",
        badgeColor: "#735f4d",
      };
  }
}

function consolidationPalette(state: MemoryConsolidationState) {
  switch (state) {
    case "candidate":
      return {
        background: "rgba(244, 233, 211, 0.98)",
        border: "rgba(194, 167, 127, 0.7)",
        selectedBackground: "rgba(234, 218, 199, 0.98)",
        selectedBorder: "rgba(171, 143, 106, 0.84)",
        mutedBackground: "rgba(244, 233, 211, 0.74)",
        eyebrowColor: "#776550",
        badgeColor: "#776550",
      };
    case "approved":
      return {
        background: "rgba(224, 238, 230, 0.98)",
        border: "rgba(128, 170, 146, 0.68)",
        selectedBackground: "rgba(214, 230, 220, 0.98)",
        selectedBorder: "rgba(106, 149, 124, 0.82)",
        mutedBackground: "rgba(224, 238, 230, 0.74)",
        eyebrowColor: "#58755f",
        badgeColor: "#58755f",
      };
    case "rejected":
      return {
        background: "rgba(236, 233, 229, 0.98)",
        border: "rgba(170, 163, 154, 0.58)",
        selectedBackground: "rgba(227, 223, 217, 0.98)",
        selectedBorder: "rgba(144, 136, 128, 0.76)",
        mutedBackground: "rgba(236, 233, 229, 0.72)",
        eyebrowColor: "#6e675f",
        badgeColor: "#6e675f",
      };
    case "archived":
      return {
        background: "rgba(231, 235, 239, 0.98)",
        border: "rgba(152, 164, 176, 0.56)",
        selectedBackground: "rgba(221, 226, 231, 0.98)",
        selectedBorder: "rgba(128, 141, 154, 0.76)",
        mutedBackground: "rgba(231, 235, 239, 0.72)",
        eyebrowColor: "#5e6974",
        badgeColor: "#5e6974",
      };
    case "none":
    default:
      return {
        background: "rgba(247, 241, 233, 0.98)",
        border: "rgba(207, 192, 173, 0.76)",
        selectedBackground: "rgba(239, 231, 220, 0.98)",
        selectedBorder: "rgba(182, 157, 122, 0.82)",
        mutedBackground: "rgba(247, 241, 233, 0.72)",
        eyebrowColor: "#766d63",
        badgeColor: "#766d63",
      };
  }
}

function schemaLabel(traceType: MemoryTraceType) {
  switch (traceType) {
    case "semantic":
      return "schema cluster";
    case "episodic":
      return "episode trace";
    case "working":
    default:
      return "working buffer";
  }
}

function edgeStrokeColor(
  workbenchView: "activation" | "consolidation" | "schema",
  sourceNode: MemoryGraphNode | undefined,
  targetNode: MemoryGraphNode | undefined,
  depth: number,
) {
  if (workbenchView === "schema") {
    return sourceNode?.traceType === "semantic" || targetNode?.traceType === "semantic"
      ? "rgba(128, 170, 146, 0.58)"
      : "rgba(184, 169, 150, 0.46)";
  }

  if (workbenchView === "consolidation") {
    return sourceNode?.consolidationState === "candidate" ||
      targetNode?.consolidationState === "candidate"
      ? "rgba(194, 167, 127, 0.6)"
      : sourceNode?.consolidationState === "approved" ||
          targetNode?.consolidationState === "approved"
        ? "rgba(128, 170, 146, 0.54)"
        : depth >= 2
          ? "rgba(193, 179, 160, 0.32)"
          : "rgba(170, 156, 138, 0.46)";
  }

  return sourceNode?.traceType === "working" || targetNode?.traceType === "working"
    ? "rgba(194, 167, 127, 0.58)"
    : sourceNode?.traceType === "episodic" || targetNode?.traceType === "episodic"
      ? "rgba(196, 149, 129, 0.56)"
      : depth >= 2
        ? "rgba(147, 171, 192, 0.36)"
        : "rgba(126, 152, 174, 0.56)";
}
