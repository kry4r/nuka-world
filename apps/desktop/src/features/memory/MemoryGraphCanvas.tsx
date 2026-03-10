import { useRef, type PointerEvent, type WheelEvent } from "react";
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
  zoom: number;
  workbenchView: "activation" | "consolidation" | "schema";
  onPanChange: (pan: Point) => void;
  onSelectNode: (nodeId: string) => void;
  onZoomChange: (zoom: number) => void;
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
  zoom,
  workbenchView,
  onPanChange,
  onSelectNode,
  onZoomChange,
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
      data-focus-target-id={focusTargetId ?? ""}
      data-pan-x={String(pan.x)}
      data-pan-y={String(pan.y)}
      data-testid="memory-graph-canvas"
      data-workbench-view={workbenchView}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      style={{
        background:
          "radial-gradient(circle at top, rgba(243, 178, 103, 0.18), transparent 45%), linear-gradient(180deg, rgba(14, 17, 24, 0.98), rgba(8, 10, 15, 0.94))",
        border: "1px solid rgba(243, 178, 103, 0.18)",
        borderRadius: "1.5rem",
        minHeight: "34rem",
        overflow: "hidden",
        position: "relative",
        touchAction: "none",
      }}
    >
      <div
        style={{
          color: "rgba(255, 255, 255, 0.58)",
          display: "flex",
          fontSize: "0.85rem",
          justifyContent: "space-between",
          left: "1rem",
          letterSpacing: "0.08em",
          position: "absolute",
          right: "1rem",
          textTransform: "uppercase",
          top: "1rem",
          zIndex: 2,
        }}
      >
        <span>Drag to pan</span>
        <span>Scroll to zoom</span>
      </div>

      <div
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
              data-consolidation-state={node.consolidationState}
              data-node-depth={depth}
              data-node-emphasis={emphasis}
              data-trace-type={node.traceType}
              onClick={() => onSelectNode(node.id)}
              style={{
                alignItems: "flex-start",
                background: presentation.background,
                border: presentation.border,
                borderRadius: "1.25rem",
                boxShadow: presentation.shadow,
                color: "rgba(248, 244, 236, 0.96)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                height: `${nodeSize.height}px`,
                justifyContent: "space-between",
                left: `${point.x}px`,
                opacity: depth === 2 ? 0.74 : depth >= 3 ? 0.46 : 1,
                padding: "1rem",
                position: "absolute",
                textAlign: "left",
                top: `${point.y}px`,
                width: `${nodeSize.width}px`,
              }}
              type="button"
              >
              <span
                style={{
                  color: presentation.eyebrowColor,
                  fontSize: "0.74rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {node.kind} · {node.traceType}
              </span>
              <span style={{ fontSize: "1rem", fontWeight: 600, lineHeight: 1.2 }}>{node.title}</span>
              <span
                style={{
                  color: "rgba(255, 255, 255, 0.62)",
                  fontSize: "0.82rem",
                  lineHeight: 1.35,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {node.body ?? "No note yet."}
              </span>
              <span
                style={{
                  color: presentation.badgeColor,
                  fontSize: "0.74rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
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
      y: 96 + row * 148,
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
  const trace = tracePalette(node.traceType);
  const consolidation = consolidationPalette(node.consolidationState);
  const muted = depth >= 3;

  if (workbenchView === "consolidation") {
    return {
      background: selected
        ? consolidation.selectedBackground
        : muted
          ? consolidation.mutedBackground
          : consolidation.background,
      border: selected ? consolidation.selectedBorder : consolidation.border,
      shadow: selected
        ? "0 18px 40px rgba(243, 178, 103, 0.22)"
        : "0 12px 30px rgba(0, 0, 0, 0.24)",
      eyebrowColor: consolidation.eyebrowColor,
      badgeColor: consolidation.badgeColor,
    };
  }

  if (workbenchView === "schema") {
    const semantic = node.traceType === "semantic";
    return {
      background: semantic
        ? "linear-gradient(180deg, rgba(92, 201, 165, 0.24), rgba(92, 201, 165, 0.08))"
        : "linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))",
      border: semantic
        ? "1px solid rgba(92, 201, 165, 0.78)"
        : "1px solid rgba(255, 255, 255, 0.08)",
      shadow: selected
        ? "0 18px 40px rgba(92, 201, 165, 0.18)"
        : "0 12px 30px rgba(0, 0, 0, 0.24)",
      eyebrowColor: semantic ? "rgba(214, 255, 241, 0.92)" : "rgba(255, 255, 255, 0.62)",
      badgeColor: semantic ? "rgba(214, 255, 241, 0.78)" : "rgba(255, 255, 255, 0.54)",
    };
  }

  return {
    background: selected
      ? trace.selectedBackground
      : muted
        ? trace.mutedBackground
        : trace.background,
    border: selected ? trace.selectedBorder : trace.border,
    shadow: selected
      ? "0 20px 48px rgba(243, 178, 103, 0.18)"
      : "0 12px 30px rgba(0, 0, 0, 0.24)",
    eyebrowColor: trace.eyebrowColor,
    badgeColor: trace.badgeColor,
  };
}

function tracePalette(traceType: MemoryTraceType) {
  switch (traceType) {
    case "working":
      return {
        background: "linear-gradient(180deg, rgba(244, 208, 96, 0.2), rgba(244, 208, 96, 0.06))",
        border: "1px solid rgba(244, 208, 96, 0.52)",
        selectedBackground:
          "linear-gradient(180deg, rgba(244, 208, 96, 0.32), rgba(244, 208, 96, 0.1))",
        selectedBorder: "1px solid rgba(255, 224, 125, 0.92)",
        mutedBackground:
          "linear-gradient(180deg, rgba(244, 208, 96, 0.08), rgba(244, 208, 96, 0.02))",
        eyebrowColor: "rgba(255, 237, 173, 0.88)",
        badgeColor: "rgba(255, 237, 173, 0.78)",
      };
    case "episodic":
      return {
        background: "linear-gradient(180deg, rgba(233, 143, 96, 0.2), rgba(233, 143, 96, 0.06))",
        border: "1px solid rgba(233, 143, 96, 0.52)",
        selectedBackground:
          "linear-gradient(180deg, rgba(233, 143, 96, 0.32), rgba(233, 143, 96, 0.1))",
        selectedBorder: "1px solid rgba(255, 178, 138, 0.9)",
        mutedBackground:
          "linear-gradient(180deg, rgba(233, 143, 96, 0.08), rgba(233, 143, 96, 0.02))",
        eyebrowColor: "rgba(255, 214, 194, 0.88)",
        badgeColor: "rgba(255, 214, 194, 0.78)",
      };
    case "semantic":
    default:
      return {
        background: "linear-gradient(180deg, rgba(103, 171, 243, 0.2), rgba(103, 171, 243, 0.06))",
        border: "1px solid rgba(103, 171, 243, 0.48)",
        selectedBackground:
          "linear-gradient(180deg, rgba(103, 171, 243, 0.34), rgba(103, 171, 243, 0.1))",
        selectedBorder: "1px solid rgba(171, 217, 255, 0.9)",
        mutedBackground:
          "linear-gradient(180deg, rgba(103, 171, 243, 0.08), rgba(103, 171, 243, 0.02))",
        eyebrowColor: "rgba(214, 232, 255, 0.88)",
        badgeColor: "rgba(214, 232, 255, 0.78)",
      };
  }
}

function consolidationPalette(state: MemoryConsolidationState) {
  switch (state) {
    case "candidate":
      return {
        background: "linear-gradient(180deg, rgba(243, 178, 103, 0.22), rgba(243, 178, 103, 0.08))",
        border: "1px solid rgba(243, 178, 103, 0.68)",
        selectedBackground:
          "linear-gradient(180deg, rgba(243, 178, 103, 0.3), rgba(243, 178, 103, 0.12))",
        selectedBorder: "1px solid rgba(255, 214, 156, 0.92)",
        mutedBackground:
          "linear-gradient(180deg, rgba(243, 178, 103, 0.08), rgba(243, 178, 103, 0.03))",
        eyebrowColor: "rgba(255, 226, 194, 0.9)",
        badgeColor: "rgba(255, 226, 194, 0.78)",
      };
    case "approved":
      return {
        background: "linear-gradient(180deg, rgba(92, 201, 165, 0.22), rgba(92, 201, 165, 0.08))",
        border: "1px solid rgba(92, 201, 165, 0.64)",
        selectedBackground:
          "linear-gradient(180deg, rgba(92, 201, 165, 0.3), rgba(92, 201, 165, 0.12))",
        selectedBorder: "1px solid rgba(205, 255, 241, 0.9)",
        mutedBackground:
          "linear-gradient(180deg, rgba(92, 201, 165, 0.08), rgba(92, 201, 165, 0.03))",
        eyebrowColor: "rgba(205, 255, 241, 0.88)",
        badgeColor: "rgba(205, 255, 241, 0.78)",
      };
    case "rejected":
      return {
        background: "linear-gradient(180deg, rgba(160, 160, 160, 0.16), rgba(160, 160, 160, 0.04))",
        border: "1px solid rgba(160, 160, 160, 0.36)",
        selectedBackground:
          "linear-gradient(180deg, rgba(160, 160, 160, 0.22), rgba(160, 160, 160, 0.08))",
        selectedBorder: "1px solid rgba(208, 208, 208, 0.7)",
        mutedBackground:
          "linear-gradient(180deg, rgba(160, 160, 160, 0.06), rgba(160, 160, 160, 0.02))",
        eyebrowColor: "rgba(222, 222, 222, 0.78)",
        badgeColor: "rgba(222, 222, 222, 0.68)",
      };
    case "archived":
      return {
        background: "linear-gradient(180deg, rgba(109, 123, 140, 0.14), rgba(109, 123, 140, 0.04))",
        border: "1px solid rgba(109, 123, 140, 0.3)",
        selectedBackground:
          "linear-gradient(180deg, rgba(109, 123, 140, 0.2), rgba(109, 123, 140, 0.08))",
        selectedBorder: "1px solid rgba(176, 188, 202, 0.66)",
        mutedBackground:
          "linear-gradient(180deg, rgba(109, 123, 140, 0.06), rgba(109, 123, 140, 0.02))",
        eyebrowColor: "rgba(208, 220, 235, 0.76)",
        badgeColor: "rgba(208, 220, 235, 0.66)",
      };
    case "none":
    default:
      return {
        background: "linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02))",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        selectedBackground:
          "linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04))",
        selectedBorder: "1px solid rgba(255, 255, 255, 0.32)",
        mutedBackground:
          "linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02))",
        eyebrowColor: "rgba(255, 255, 255, 0.72)",
        badgeColor: "rgba(255, 255, 255, 0.58)",
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
      ? "rgba(92, 201, 165, 0.42)"
      : "rgba(255, 255, 255, 0.18)";
  }

  if (workbenchView === "consolidation") {
    return sourceNode?.consolidationState === "candidate" ||
      targetNode?.consolidationState === "candidate"
      ? "rgba(243, 178, 103, 0.42)"
      : sourceNode?.consolidationState === "approved" ||
          targetNode?.consolidationState === "approved"
        ? "rgba(92, 201, 165, 0.36)"
        : depth >= 2
          ? "rgba(255, 255, 255, 0.14)"
          : "rgba(255, 255, 255, 0.24)";
  }

  return sourceNode?.traceType === "working" || targetNode?.traceType === "working"
    ? "rgba(244, 208, 96, 0.38)"
    : sourceNode?.traceType === "episodic" || targetNode?.traceType === "episodic"
      ? "rgba(233, 143, 96, 0.34)"
      : depth >= 2
        ? "rgba(103, 171, 243, 0.22)"
        : "rgba(103, 171, 243, 0.38)";
}
