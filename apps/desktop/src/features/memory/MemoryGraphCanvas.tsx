import { useRef, type PointerEvent, type WheelEvent } from "react";
import type { MemoryGraph, MemoryGraphEdge, MemoryGraphNode } from "@/lib/memory";

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
              target={layout.get(edge.targetId)}
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

          return (
            <button
              key={node.id}
              aria-label={`${node.title} memory node`}
              aria-pressed={selected}
              data-node-depth={depth}
              data-node-emphasis={emphasis}
              onClick={() => onSelectNode(node.id)}
              style={{
                alignItems: "flex-start",
                background: selected
                  ? "linear-gradient(180deg, rgba(243, 178, 103, 0.3), rgba(243, 178, 103, 0.08))"
                  : depth === 1
                    ? "linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.05))"
                    : depth === 2
                      ? "linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))"
                      : "linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02))",
                border: selected
                  ? "1px solid rgba(243, 178, 103, 0.92)"
                  : depth === 1
                    ? "1px solid rgba(255, 255, 255, 0.16)"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "1.25rem",
                boxShadow: selected
                  ? "0 20px 48px rgba(243, 178, 103, 0.18)"
                  : "0 12px 30px rgba(0, 0, 0, 0.24)",
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
                  color: selected ? "rgba(255, 224, 178, 0.96)" : "rgba(255, 255, 255, 0.62)",
                  fontSize: "0.74rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {node.kind}
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
  target,
}: {
  depth: number;
  edge: MemoryGraphEdge;
  source?: Point;
  target?: Point;
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
        stroke={depth >= 2 ? "rgba(243, 178, 103, 0.2)" : "rgba(243, 178, 103, 0.42)"}
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
