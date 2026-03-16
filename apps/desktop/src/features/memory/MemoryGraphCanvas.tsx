import {
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent,
  type WheelEvent,
} from "react";
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

type LayoutLabelPlacement = "bottom" | "left" | "right" | "top";

type LayoutLabelState = {
  placement: LayoutLabelPlacement;
  text: string;
  visibility: "full" | "hidden";
};

type Rect = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export const canvasSize = { width: 1120, height: 760 };
export const nodeSize = { width: 92, height: 92 };

const labelBounds = {
  gap: 18,
  height: 30,
  maxWidth: 152,
  minWidth: 78,
};

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
  const layout = useMemo(
    () => buildLayout(graph.nodes, graph.edges, focusTargetId),
    [focusTargetId, graph.edges, graph.nodes],
  );
  const labels = useMemo(
    () => buildLabelStates(graph.nodes, graph.edges, layout, depthByNodeId, selectedNodeId),
    [depthByNodeId, graph.edges, graph.nodes, layout, selectedNodeId],
  );

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
      data-canvas-tone="network"
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
          <span className="memory-graph__focus-label">当前焦点</span>
          <strong className="memory-graph__focus-value">
            {selectedNodeTitle ?? "点一个节点查看详情"}
          </strong>
        </div>
        <div className="memory-graph__stats">
          <span>{graph.nodes.length} 节点</span>
          <span>{graph.edges.length} 连线</span>
          <span>缩放 {Math.round(zoom * 100)}%</span>
        </div>
      </div>

      <div className="memory-graph__dock memory-graph__dock--lens">
        <div className="memory-graph__dock-actions">
          {[
            { label: "活跃", value: "activation" as const },
            { label: "沉淀", value: "consolidation" as const },
            { label: "结构", value: "schema" as const },
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
        <div className="memory-graph__dock-actions">
          <button className="memory-graph__chip" onClick={onZoomOut} type="button">
            缩小
          </button>
          <button className="memory-graph__chip" onClick={onZoomIn} type="button">
            放大
          </button>
          <button className="memory-graph__chip" onClick={onFitView} type="button">
            适配
          </button>
          <button
            className="memory-graph__chip is-accent"
            disabled={!selectedNodeTitle}
            onClick={onFocusSelected}
            type="button"
          >
            回到焦点
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
          const label = labels.get(node.id) ?? {
            placement: "right",
            text: shortTitle(node.title, 18),
            visibility: "hidden",
          };

          return (
            <button
              key={node.id}
              aria-label={`${node.title} memory node`}
              aria-pressed={selected}
              className="memory-graph__node"
              data-consolidation-state={node.consolidationState}
              data-label-placement={label.placement}
              data-label-visibility={label.visibility}
              data-node-depth={depth}
              data-node-emphasis={emphasis}
              data-node-shape="dot"
              data-trace-type={node.traceType}
              onClick={() => onSelectNode(node.id)}
              style={
                {
                  "--memory-node-aura": presentation.aura,
                  "--memory-node-fill": presentation.fill,
                  "--memory-node-glow": presentation.glow,
                  "--memory-node-label-background": presentation.labelBackground,
                  "--memory-node-label-border": presentation.labelBorder,
                  "--memory-node-label-color": presentation.labelColor,
                  "--memory-node-ring": presentation.ring,
                  height: `${nodeSize.height}px`,
                  left: `${point.x}px`,
                  opacity: selected ? 1 : depth === 2 ? 0.84 : depth >= 3 ? 0.62 : 0.94,
                  top: `${point.y}px`,
                  width: `${nodeSize.width}px`,
                } as CSSProperties
              }
              type="button"
            >
              <span aria-hidden="true" className="memory-graph__node-hit" />
              <span aria-hidden="true" className="memory-graph__node-dot" />
              {label.visibility === "full" ? (
                <span className="memory-graph__node-label">{label.text}</span>
              ) : null}
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
  const delta = Math.max(Math.abs(endX - startX) * 0.3, 68);
  const path = `M ${startX} ${startY} C ${startX + delta} ${startY}, ${endX - delta} ${endY}, ${endX} ${endY}`;

  return (
    <path
      d={path}
      data-relation={edge.relation}
      fill="none"
      opacity={depth >= 3 ? 0.16 : depth === 2 ? 0.24 : 0.42}
      stroke={edgeStrokeColor(workbenchView, sourceNode, targetNode, depth)}
      strokeWidth={depth >= 2 ? "1.2" : "1.55"}
    />
  );
}

export function buildLayout(
  nodes: MemoryGraphNode[],
  edges: MemoryGraphEdge[] = [],
  focusTargetId: string | null = null,
) {
  const layout = new Map<string, Point>();

  if (nodes.length === 0) {
    return layout;
  }

  const center = { x: canvasSize.width / 2, y: canvasSize.height / 2 };
  const focusId =
    (focusTargetId && nodes.some((node) => node.id === focusTargetId) ? focusTargetId : null) ??
    nodes[0]!.id;
  const adjacency = buildAdjacency(nodes, edges);
  const depthByNodeId = buildDepthMap(nodes, adjacency, focusId);
  const centers = new Map<string, Point>();
  const anchors = new Map<string, Point>();
  const padding = 84;

  centers.set(focusId, center);
  anchors.set(focusId, center);

  const connected = nodes
    .filter((node) => node.id !== focusId && (depthByNodeId.get(node.id) ?? 99) < 99)
    .sort((left, right) => {
      const leftDepth = depthByNodeId.get(left.id) ?? 99;
      const rightDepth = depthByNodeId.get(right.id) ?? 99;
      if (leftDepth !== rightDepth) {
        return leftDepth - rightDepth;
      }
      return hashNumber(left.id) - hashNumber(right.id);
    });
  const disconnected = nodes
    .filter((node) => node.id !== focusId && !connected.some((entry) => entry.id === node.id))
    .sort((left, right) => hashNumber(left.id) - hashNumber(right.id));
  const firstDegree = connected.filter((node) => depthByNodeId.get(node.id) === 1);
  const parentAngles = new Map<string, number>();

  firstDegree.forEach((node, index) => {
    const angle =
      -Math.PI / 2 +
      ((Math.PI * 2) / Math.max(firstDegree.length, 1)) * index +
      jitterAngle(node.id, 0.18);
    const radius = 152 + jitterNumber(node.id, 24);
    const point = clampPoint(polar(center, angle, radius, 0.82), padding);

    centers.set(node.id, point);
    anchors.set(node.id, point);
    parentAngles.set(node.id, angle);
  });

  const siblingOffsets = new Map<string, number>();

  connected
    .filter((node) => (depthByNodeId.get(node.id) ?? 99) > 1)
    .forEach((node) => {
      const depth = depthByNodeId.get(node.id) ?? 3;
      const parentId = pickPrimaryParent(node.id, adjacency, depthByNodeId, focusId);
      const parentCenter = anchors.get(parentId) ?? center;
      const parentAngle =
        parentAngles.get(parentId) ??
        angleBetween(center, parentCenter) + jitterAngle(parentId, 0.16);
      const siblingIndex = siblingOffsets.get(parentId) ?? 0;
      siblingOffsets.set(parentId, siblingIndex + 1);
      const spread = depth === 2 ? 0.42 : 0.32;
      const angle =
        parentAngle +
        (siblingIndex - 1) * spread +
        jitterAngle(`${node.id}:${parentId}`, 0.14);
      const radius = depth === 2 ? 138 + jitterNumber(node.id, 22) : 166 + jitterNumber(node.id, 28);
      const point = clampPoint(polar(parentCenter, angle, radius, 0.74), padding);

      centers.set(node.id, point);
      anchors.set(node.id, point);
      parentAngles.set(node.id, angle);
    });

  disconnected.forEach((node, index) => {
    const angle =
      -Math.PI / 3 +
      index * 2.399963229728653 +
      jitterAngle(node.id, 0.2);
    const radius = 274 + (index % 3) * 28 + jitterNumber(node.id, 26);
    const point = clampPoint(polar(center, angle, radius, 0.86), padding);

    centers.set(node.id, point);
    anchors.set(node.id, point);
  });

  const movableIds = nodes.map((node) => node.id).filter((nodeId) => nodeId !== focusId);

  for (let iteration = 0; iteration < 40; iteration += 1) {
    for (const nodeId of movableIds) {
      const current = centers.get(nodeId);
      const anchor = anchors.get(nodeId);

      if (!current || !anchor) {
        continue;
      }

      let forceX = 0;
      let forceY = 0;

      for (const peer of movableIds) {
        if (peer === nodeId) {
          continue;
        }

        const peerPoint = centers.get(peer);
        if (!peerPoint) {
          continue;
        }

        const dx = current.x - peerPoint.x;
        const dy = current.y - peerPoint.y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const repulsion = distance < 148 ? 900 / distance : 420 / distance;

        forceX += (dx / distance) * repulsion;
        forceY += (dy / distance) * repulsion;
      }

      for (const neighborId of adjacency.get(nodeId) ?? []) {
        const neighborPoint = centers.get(neighborId);
        if (!neighborPoint) {
          continue;
        }

        const dx = current.x - neighborPoint.x;
        const dy = current.y - neighborPoint.y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const idealDistance = depthByNodeId.get(nodeId) === 1 ? 156 : 134;
        const pull = (distance - idealDistance) * 0.075;

        forceX -= (dx / distance) * pull;
        forceY -= (dy / distance) * pull;
      }

      forceX += (anchor.x - current.x) * 0.08;
      forceY += (anchor.y - current.y) * 0.08;
      forceX += (center.x - current.x) * 0.012;
      forceY += (center.y - current.y) * 0.012;

      centers.set(nodeId, clampPoint({
        x: current.x + forceX,
        y: current.y + forceY,
      }, padding));
    }
  }

  for (const node of nodes) {
    const point = centers.get(node.id) ?? center;
    layout.set(node.id, {
      x: Math.round(point.x - nodeSize.width / 2),
      y: Math.round(point.y - nodeSize.height / 2),
    });
  }

  return layout;
}

function buildLabelStates(
  nodes: MemoryGraphNode[],
  edges: MemoryGraphEdge[],
  layout: Map<string, Point>,
  depthByNodeId: Record<string, number>,
  selectedNodeId: string | null,
) {
  const degreeByNodeId = buildDegreeMap(nodes, edges);
  const occupied: Rect[] = [];
  const labels = new Map<string, LayoutLabelState>();
  const showAllLabels = nodes.length <= 7;
  const denseLimit =
    nodes.length >= 16 ? 5 : nodes.length >= 12 ? 6 : nodes.length >= 8 ? 7 : nodes.length;

  let visibleCount = 0;

  const candidates = nodes
    .map((node) => ({
      degree: degreeByNodeId.get(node.id) ?? 0,
      depth: depthByNodeId[node.id] ?? 3,
      node,
      point: layout.get(node.id),
    }))
    .sort((left, right) => {
      const leftPriority = labelPriority(left.node.id, selectedNodeId, left.depth, left.degree);
      const rightPriority = labelPriority(right.node.id, selectedNodeId, right.depth, right.degree);

      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority;
      }

      return hashNumber(left.node.id) - hashNumber(right.node.id);
    });

  for (const candidate of candidates) {
    if (!candidate.point) {
      labels.set(candidate.node.id, {
        placement: "right",
        text: shortTitle(candidate.node.title, 16),
        visibility: "hidden",
      });
      continue;
    }

    const alwaysShow = candidate.node.id === selectedNodeId;
    const canShow = showAllLabels || alwaysShow || candidate.depth <= 1;

    if (!canShow || (!alwaysShow && visibleCount >= denseLimit)) {
      labels.set(candidate.node.id, {
        placement: preferredPlacements(candidate.point)[0],
        text: shortTitle(candidate.node.title, 16),
        visibility: "hidden",
      });
      continue;
    }

    const text = shortTitle(candidate.node.title, showAllLabels ? 24 : alwaysShow ? 22 : 16);
    const placements = preferredPlacements(candidate.point);
    let chosenPlacement = placements[0];
    let fits = false;

    for (const placement of placements) {
      const rect = labelRect(candidate.point, text, placement);
      if (alwaysShow || !occupied.some((entry) => overlaps(entry, rect))) {
        occupied.push(rect);
        chosenPlacement = placement;
        fits = true;
        break;
      }
    }

    labels.set(candidate.node.id, {
      placement: chosenPlacement,
      text,
      visibility: fits || alwaysShow ? "full" : "hidden",
    });

    if (fits || alwaysShow) {
      visibleCount += 1;
    }
  }

  return labels;
}

function labelPriority(
  nodeId: string,
  selectedNodeId: string | null,
  depth: number,
  degree: number,
) {
  if (nodeId === selectedNodeId) {
    return 1000;
  }

  if (depth === 0) {
    return 800;
  }

  if (depth === 1) {
    return 500 + degree * 8;
  }

  if (depth === 2) {
    return 220 + degree * 6;
  }

  return 40 + degree * 4;
}

function buildAdjacency(nodes: MemoryGraphNode[], edges: MemoryGraphEdge[]) {
  const adjacency = new Map<string, Set<string>>();
  const nodeIds = new Set(nodes.map((node) => node.id));

  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) {
      continue;
    }

    adjacency.get(edge.sourceId)?.add(edge.targetId);
    adjacency.get(edge.targetId)?.add(edge.sourceId);
  }

  return adjacency;
}

function buildDegreeMap(nodes: MemoryGraphNode[], edges: MemoryGraphEdge[]) {
  const adjacency = buildAdjacency(nodes, edges);
  const degreeByNodeId = new Map<string, number>();

  for (const node of nodes) {
    degreeByNodeId.set(node.id, adjacency.get(node.id)?.size ?? 0);
  }

  return degreeByNodeId;
}

function buildDepthMap(
  nodes: MemoryGraphNode[],
  adjacency: Map<string, Set<string>>,
  focusId: string,
) {
  const depthByNodeId = new Map<string, number>();

  for (const node of nodes) {
    depthByNodeId.set(node.id, 99);
  }

  const queue: Array<{ depth: number; id: string }> = [{ depth: 0, id: focusId }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) {
      continue;
    }

    visited.add(current.id);
    depthByNodeId.set(current.id, current.depth);

    for (const neighborId of adjacency.get(current.id) ?? []) {
      if (!visited.has(neighborId)) {
        queue.push({ depth: current.depth + 1, id: neighborId });
      }
    }
  }

  return depthByNodeId;
}

function pickPrimaryParent(
  nodeId: string,
  adjacency: Map<string, Set<string>>,
  depthByNodeId: Map<string, number>,
  fallbackId: string,
) {
  const currentDepth = depthByNodeId.get(nodeId) ?? 99;
  const candidates = Array.from(adjacency.get(nodeId) ?? []).filter((neighborId) => {
    const neighborDepth = depthByNodeId.get(neighborId) ?? 99;
    return neighborDepth < currentDepth;
  });

  if (candidates.length === 0) {
    return fallbackId;
  }

  return candidates.sort((left, right) => {
    const leftDepth = depthByNodeId.get(left) ?? 99;
    const rightDepth = depthByNodeId.get(right) ?? 99;
    if (leftDepth !== rightDepth) {
      return leftDepth - rightDepth;
    }
    return hashNumber(left) - hashNumber(right);
  })[0]!;
}

function preferredPlacements(point: Point): LayoutLabelPlacement[] {
  const centerX = point.x + nodeSize.width / 2;
  const centerY = point.y + nodeSize.height / 2;

  if (centerX > canvasSize.width * 0.7) {
    return centerY < canvasSize.height * 0.28
      ? ["left", "bottom", "top", "right"]
      : ["left", "top", "bottom", "right"];
  }

  if (centerY < canvasSize.height * 0.28) {
    return ["bottom", "right", "left", "top"];
  }

  return ["right", "left", "bottom", "top"];
}

function labelRect(point: Point, text: string, placement: LayoutLabelPlacement): Rect {
  const centerX = point.x + nodeSize.width / 2;
  const centerY = point.y + nodeSize.height / 2;
  const width = Math.min(
    labelBounds.maxWidth,
    Math.max(labelBounds.minWidth, Math.round(text.length * 7.2) + 28),
  );

  switch (placement) {
    case "left":
      return {
        bottom: centerY + labelBounds.height / 2,
        left: centerX - labelBounds.gap - width,
        right: centerX - labelBounds.gap,
        top: centerY - labelBounds.height / 2,
      };
    case "top":
      return {
        bottom: centerY - labelBounds.gap,
        left: centerX - width / 2,
        right: centerX + width / 2,
        top: centerY - labelBounds.gap - labelBounds.height,
      };
    case "bottom":
      return {
        bottom: centerY + labelBounds.gap + labelBounds.height,
        left: centerX - width / 2,
        right: centerX + width / 2,
        top: centerY + labelBounds.gap,
      };
    case "right":
    default:
      return {
        bottom: centerY + labelBounds.height / 2,
        left: centerX + labelBounds.gap,
        right: centerX + labelBounds.gap + width,
        top: centerY - labelBounds.height / 2,
      };
  }
}

function overlaps(left: Rect, right: Rect) {
  return !(
    left.right < right.left ||
    left.left > right.right ||
    left.bottom < right.top ||
    left.top > right.bottom
  );
}

function polar(center: Point, angle: number, radius: number, verticalScale = 1) {
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius * verticalScale,
  };
}

function clampPoint(point: Point, padding: number) {
  return {
    x: clamp(point.x, padding, canvasSize.width - padding),
    y: clamp(point.y, padding, canvasSize.height - padding),
  };
}

function angleBetween(center: Point, point: Point) {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

function shortTitle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function hashNumber(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function jitterNumber(value: string, magnitude: number) {
  return (hashNumber(value) % 10_000) / 10_000 * magnitude - magnitude / 2;
}

function jitterAngle(value: string, magnitude: number) {
  return ((hashNumber(value) % 10_000) / 10_000) * magnitude - magnitude / 2;
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
  const palette =
    workbenchView === "consolidation"
      ? consolidationPalette(node.consolidationState)
      : workbenchView === "schema"
        ? schemaPalette(node.traceType)
        : kindPalette(node.kind);
  const muted = depth >= 3;

  return {
    aura: selected ? palette.auraStrong : muted ? palette.auraSoft : palette.aura,
    fill: selected ? palette.fillStrong : muted ? palette.fillSoft : palette.fill,
    glow: selected ? palette.glowStrong : muted ? palette.glowSoft : palette.glow,
    labelBackground: selected
      ? palette.labelBackgroundStrong
      : muted
        ? palette.labelBackgroundSoft
        : palette.labelBackground,
    labelBorder: selected ? palette.labelBorderStrong : palette.labelBorder,
    labelColor: palette.labelColor,
    ring: selected ? palette.ringStrong : muted ? palette.ringSoft : palette.ring,
  };
}

function kindPalette(kind: MemoryGraphNode["kind"]) {
  switch (kind) {
    case "workflow":
      return {
        aura: "rgba(47, 140, 255, 0.18)",
        auraSoft: "rgba(47, 140, 255, 0.12)",
        auraStrong: "rgba(47, 140, 255, 0.28)",
        fill: "#49a0ff",
        fillSoft: "#6ea6e2",
        fillStrong: "#2f8cff",
        glow: "rgba(47, 140, 255, 0.5)",
        glowSoft: "rgba(47, 140, 255, 0.24)",
        glowStrong: "rgba(47, 140, 255, 0.76)",
        labelBackground: "rgba(247, 252, 255, 0.94)",
        labelBackgroundSoft: "rgba(247, 252, 255, 0.78)",
        labelBackgroundStrong: "rgba(250, 253, 255, 0.99)",
        labelBorder: "rgba(47, 140, 255, 0.38)",
        labelBorderStrong: "rgba(47, 140, 255, 0.62)",
        labelColor: "#1f4f84",
        ring: "rgba(47, 140, 255, 0.74)",
        ringSoft: "rgba(47, 140, 255, 0.36)",
        ringStrong: "rgba(178, 219, 255, 0.98)",
      };
    case "session":
      return {
        aura: "rgba(255, 191, 61, 0.18)",
        auraSoft: "rgba(255, 191, 61, 0.12)",
        auraStrong: "rgba(255, 191, 61, 0.28)",
        fill: "#ffbf3d",
        fillSoft: "#d4b26a",
        fillStrong: "#ffb000",
        glow: "rgba(255, 191, 61, 0.48)",
        glowSoft: "rgba(255, 191, 61, 0.22)",
        glowStrong: "rgba(255, 191, 61, 0.74)",
        labelBackground: "rgba(255, 249, 236, 0.94)",
        labelBackgroundSoft: "rgba(255, 249, 236, 0.78)",
        labelBackgroundStrong: "rgba(255, 250, 240, 0.99)",
        labelBorder: "rgba(255, 191, 61, 0.34)",
        labelBorderStrong: "rgba(255, 191, 61, 0.56)",
        labelColor: "#77520f",
        ring: "rgba(255, 191, 61, 0.76)",
        ringSoft: "rgba(255, 191, 61, 0.36)",
        ringStrong: "rgba(255, 226, 155, 0.98)",
      };
    case "agent":
      return {
        aura: "rgba(24, 210, 176, 0.18)",
        auraSoft: "rgba(24, 210, 176, 0.12)",
        auraStrong: "rgba(24, 210, 176, 0.28)",
        fill: "#18d2b0",
        fillSoft: "#60bbaa",
        fillStrong: "#00c8a2",
        glow: "rgba(24, 210, 176, 0.48)",
        glowSoft: "rgba(24, 210, 176, 0.22)",
        glowStrong: "rgba(24, 210, 176, 0.74)",
        labelBackground: "rgba(240, 255, 250, 0.94)",
        labelBackgroundSoft: "rgba(240, 255, 250, 0.78)",
        labelBackgroundStrong: "rgba(245, 255, 252, 0.99)",
        labelBorder: "rgba(24, 210, 176, 0.34)",
        labelBorderStrong: "rgba(24, 210, 176, 0.58)",
        labelColor: "#0d5a49",
        ring: "rgba(24, 210, 176, 0.76)",
        ringSoft: "rgba(24, 210, 176, 0.36)",
        ringStrong: "rgba(177, 255, 236, 0.98)",
      };
    case "message":
      return {
        aura: "rgba(255, 95, 122, 0.18)",
        auraSoft: "rgba(255, 95, 122, 0.12)",
        auraStrong: "rgba(255, 95, 122, 0.28)",
        fill: "#ff5f7a",
        fillSoft: "#d897a2",
        fillStrong: "#ff4a68",
        glow: "rgba(255, 95, 122, 0.5)",
        glowSoft: "rgba(255, 95, 122, 0.22)",
        glowStrong: "rgba(255, 95, 122, 0.76)",
        labelBackground: "rgba(255, 244, 246, 0.94)",
        labelBackgroundSoft: "rgba(255, 244, 246, 0.78)",
        labelBackgroundStrong: "rgba(255, 248, 249, 0.99)",
        labelBorder: "rgba(255, 95, 122, 0.34)",
        labelBorderStrong: "rgba(255, 95, 122, 0.58)",
        labelColor: "#7d2638",
        ring: "rgba(255, 95, 122, 0.76)",
        ringSoft: "rgba(255, 95, 122, 0.34)",
        ringStrong: "rgba(255, 205, 214, 0.98)",
      };
    case "fact":
    default:
      return {
        aura: "rgba(255, 216, 76, 0.18)",
        auraSoft: "rgba(255, 216, 76, 0.12)",
        auraStrong: "rgba(255, 216, 76, 0.28)",
        fill: "#ffd84c",
        fillSoft: "#d9c96f",
        fillStrong: "#ffcf1f",
        glow: "rgba(255, 216, 76, 0.5)",
        glowSoft: "rgba(255, 216, 76, 0.22)",
        glowStrong: "rgba(255, 216, 76, 0.76)",
        labelBackground: "rgba(255, 252, 238, 0.94)",
        labelBackgroundSoft: "rgba(255, 252, 238, 0.78)",
        labelBackgroundStrong: "rgba(255, 253, 244, 0.99)",
        labelBorder: "rgba(255, 216, 76, 0.36)",
        labelBorderStrong: "rgba(255, 216, 76, 0.58)",
        labelColor: "#726009",
        ring: "rgba(255, 216, 76, 0.76)",
        ringSoft: "rgba(255, 216, 76, 0.36)",
        ringStrong: "rgba(255, 239, 169, 0.98)",
      };
  }
}

function consolidationPalette(state: MemoryConsolidationState) {
  switch (state) {
    case "candidate":
      return kindPalette("session");
    case "approved":
      return kindPalette("agent");
    case "rejected":
      return kindPalette("message");
    case "archived":
      return kindPalette("fact");
    case "none":
    default:
      return kindPalette("workflow");
  }
}

function schemaPalette(traceType: MemoryTraceType) {
  switch (traceType) {
    case "semantic":
      return kindPalette("agent");
    case "episodic":
      return kindPalette("message");
    case "working":
    default:
      return kindPalette("workflow");
  }
}

function edgeStrokeColor(
  workbenchView: "activation" | "consolidation" | "schema",
  sourceNode?: MemoryGraphNode,
  targetNode?: MemoryGraphNode,
  depth = 3,
) {
  if (workbenchView === "schema") {
    return depth >= 2 ? "rgba(118, 134, 153, 0.38)" : "rgba(99, 117, 138, 0.52)";
  }

  if (workbenchView === "consolidation") {
    const approved =
      sourceNode?.consolidationState === "approved" || targetNode?.consolidationState === "approved";

    return approved
      ? depth >= 2
        ? "rgba(104, 204, 152, 0.34)"
        : "rgba(104, 204, 152, 0.5)"
      : depth >= 2
        ? "rgba(168, 179, 191, 0.28)"
        : "rgba(168, 179, 191, 0.42)";
  }

  return depth >= 2 ? "rgba(136, 150, 171, 0.28)" : "rgba(136, 150, 171, 0.46)";
}
