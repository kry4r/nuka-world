import { startTransition, useEffect, useMemo, useState } from "react";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  createMemoryEdge,
  deleteMemoryEdge,
  deleteMemoryNode,
  loadMemoryGraph,
  type MemoryGraph,
  updateMemoryNode,
} from "@/lib/memory";
import { MemoryGraphCanvas, buildLayout, canvasSize, nodeSize } from "./MemoryGraphCanvas";
import { MemoryGraphControls } from "./MemoryGraphControls";
import { MemoryNodeInspector } from "./MemoryNodeInspector";

const defaultView = { x: 72, y: 52 };
const defaultZoom = 1;

export function MemoryPage() {
  const [graph, setGraph] = useState<MemoryGraph>({ nodes: [], edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"focused" | "full">("focused");
  const [workbenchView, setWorkbenchView] = useState<
    "activation" | "consolidation" | "schema"
  >("activation");
  const [pan, setPan] = useState(defaultView);
  const [zoom, setZoom] = useState(defaultZoom);
  const [deleteReview, setDeleteReview] = useState<{
    connectedTitles: string[];
    edgeCount: number;
    nodeId: string;
  } | null>(null);

  useEffect(() => {
    let alive = true;

    void loadMemoryGraph()
      .then((nextGraph) => {
        if (!alive) {
          return;
        }

        const nextSelectedNodeId = nextGraph.nodes[0]?.id ?? null;
        const nextLayout = buildLayout(nextGraph.nodes);
        const nextPoint = nextSelectedNodeId ? nextLayout.get(nextSelectedNodeId) : null;

        startTransition(() => {
          setGraph(nextGraph);
          setSelectedNodeId((current) => current ?? nextSelectedNodeId);
          if (nextPoint) {
            setPan(centerPan(nextPoint, defaultZoom));
            setZoom(defaultZoom);
          }
        });
      })
      .catch((reason) => {
        if (!alive) {
          return;
        }

        setLoadError(reason instanceof Error ? reason.message : "Failed to load memory graph.");
      });

    return () => {
      alive = false;
    };
  }, []);

  const visibleState = useMemo(
    () => buildVisibleGraph(graph, selectedNodeId, searchQuery, filterKind, viewMode),
    [filterKind, graph, searchQuery, selectedNodeId, viewMode],
  );
  const layout = useMemo(() => buildLayout(visibleState.graph.nodes), [visibleState.graph.nodes]);
  const selectedNode =
    visibleState.graph.nodes.find((node) => node.id === selectedNodeId) ??
    visibleState.graph.nodes[0] ??
    null;
  const selectedNodePositionKey = useMemo(() => {
    if (!selectedNode) {
      return "";
    }

    const point = layout.get(selectedNode.id);
    return point ? `${point.x}:${point.y}` : "";
  }, [layout, selectedNode]);

  useEffect(() => {
    setSelectedNodeId((current) => {
      if (graph.nodes.length === 0) {
        return null;
      }

      if (current && graph.nodes.some((node) => node.id === current)) {
        return current;
      }

      return graph.nodes[0]?.id ?? null;
    });
  }, [graph]);

  useEffect(() => {
    setSelectedNodeId((current) => {
      if (visibleState.graph.nodes.length === 0) {
        return null;
      }

      if (current && visibleState.graph.nodes.some((node) => node.id === current)) {
        return current;
      }

      return visibleState.graph.nodes[0]?.id ?? null;
    });
  }, [visibleState.graph.nodes]);

  useEffect(() => {
    setDeleteReview((current) =>
      current && current.nodeId !== selectedNode?.id ? null : current,
    );
  }, [selectedNode?.id]);

  useEffect(() => {
    if (!selectedNode) {
      return;
    }

    const point = layout.get(selectedNode.id);
    if (point) {
      setPan(centerPan(point, zoom));
    }
  }, [selectedNode?.id, selectedNodePositionKey]);

  useEffect(() => {
    setTitleDraft(selectedNode?.title ?? "");
    setBodyDraft(selectedNode?.body ?? "");
  }, [selectedNode?.id, selectedNode?.title, selectedNode?.body]);

  const connectedEdges = selectedNode
    ? graph.edges.filter((edge) => edge.sourceId === selectedNode.id || edge.targetId === selectedNode.id)
    : [];

  const handleSave = async () => {
    if (!selectedNode) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const updatedNode = await updateMemoryNode(
        selectedNode.id,
        titleDraft.trim() || selectedNode.title,
        normalizeBody(bodyDraft),
      );

      setGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) => (node.id === updatedNode.id ? updatedNode : node)),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to update node.");
    } finally {
      setBusy(false);
    }
  };

  const handleRequestDelete = () => {
    if (!selectedNode) {
      return;
    }

    const connectedTitles = connectedEdges
      .map((edge) => {
        const peerId = edge.sourceId === selectedNode.id ? edge.targetId : edge.sourceId;
        return graph.nodes.find((node) => node.id === peerId)?.title ?? peerId;
      })
      .sort((left, right) => left.localeCompare(right));

    setDeleteReview({
      connectedTitles,
      edgeCount: connectedEdges.length,
      nodeId: selectedNode.id,
    });
  };

  const handleConfirmDelete = async () => {
    if (!selectedNode) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await deleteMemoryNode(selectedNode.id);
      setGraph((current) => ({
        edges: current.edges.filter(
          (edge) => edge.sourceId !== selectedNode.id && edge.targetId !== selectedNode.id,
        ),
        nodes: current.nodes.filter((node) => node.id !== selectedNode.id),
      }));
      setDeleteReview(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to delete node.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateEdge = async (targetId: string, relation: string) => {
    if (!selectedNode) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const nextEdge = await createMemoryEdge(
        createEdgeId(selectedNode.id, targetId, relation),
        selectedNode.id,
        targetId,
        relation,
      );

      setGraph((current) => ({
        ...current,
        edges: upsertEdge(current.edges, nextEdge),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to create edge.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEdge = async (edgeId: string) => {
    setBusy(true);
    setError(null);

    try {
      await deleteMemoryEdge(edgeId);
      setGraph((current) => ({
        ...current,
        edges: current.edges.filter((edge) => edge.id !== edgeId),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to delete edge.");
    } finally {
      setBusy(false);
    }
  };

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
  };

  const handleFocusSelected = () => {
    if (!selectedNode) {
      return;
    }

    const point = layout.get(selectedNode.id);
    if (point) {
      setPan(centerPan(point, zoom));
    }
  };

  const handleFitView = () => {
    if (visibleState.graph.nodes.length === 0) {
      setPan(defaultView);
      setZoom(defaultZoom);
      return;
    }

    const { pan: fitPan, zoom: fitZoom } = fitGraph(visibleState.graph.nodes);
    setPan(fitPan);
    setZoom(fitZoom);
  };

  return (
    <div className="page-layout">
      <SectionHeader
        meta="Editable local graph nodes, links, and note bodies"
        status="Memory"
        tag="Memory"
        title="Memory Graph Workbench"
      />

      <div className="page-layout__body">
        <aside
          data-testid="memory-graph-utilities"
          style={{ alignContent: "start", display: "grid", gap: "1rem", width: "18rem" }}
        >
          <Card title="Graph Utilities" tone="accent">
            <MemoryGraphControls
              edgesCount={visibleState.graph.edges.length}
              filterKind={filterKind}
              nodesCount={visibleState.graph.nodes.length}
              onFilterKindChange={setFilterKind}
              onFitView={handleFitView}
              onFocusSelected={handleFocusSelected}
              onSearchQueryChange={setSearchQuery}
              onViewModeChange={setViewMode}
              onWorkbenchViewChange={setWorkbenchView}
              onZoomIn={() => setZoom((current) => Math.min(1.8, current + 0.12))}
              onZoomOut={() => setZoom((current) => Math.max(0.55, current - 0.12))}
              searchQuery={searchQuery}
              selectedNodeTitle={selectedNode?.title ?? null}
              viewMode={viewMode}
              workbenchView={workbenchView}
              zoom={zoom}
            />
          </Card>
        </aside>

        <div className="page-layout__main">
          <Card
            description="Inspect the local memory graph, search into focused neighborhoods, and tune node copy directly from the inspector."
            title="Graph Workspace"
            tone="accent"
          />

          <Card title="Memory Graph">
            {loadError ? (
              <Card
                description={loadError}
                title="Memory graph unavailable"
                tone="soft"
              />
            ) : visibleState.graph.nodes.length === 0 ? (
              <Card
                description="Adjust the current search or filter to bring matching memory nodes back into view."
                title="No graph nodes yet"
                tone="soft"
              />
            ) : (
              <MemoryGraphCanvas
                depthByNodeId={visibleState.depthByNodeId}
                focusTargetId={selectedNode?.id ?? null}
                graph={visibleState.graph}
                onPanChange={setPan}
                onSelectNode={handleSelectNode}
                onZoomChange={setZoom}
                pan={pan}
                selectedNodeId={selectedNode?.id ?? null}
                workbenchView={workbenchView}
                zoom={zoom}
              />
            )}
          </Card>
        </div>

        <Inspector
          description="Edit the selected memory node, remove it, and manage graph links without leaving the canvas."
          title="Node Inspector"
        >
          <MemoryNodeInspector
            bodyDraft={bodyDraft}
            busy={busy}
            connectedEdges={connectedEdges}
            deleteImpact={
              deleteReview && deleteReview.nodeId === selectedNode?.id
                ? {
                    connectedTitles: deleteReview.connectedTitles,
                    edgeCount: deleteReview.edgeCount,
                  }
                : null
            }
            error={error}
            node={selectedNode}
            nodes={graph.nodes}
            onCancelDelete={() => setDeleteReview(null)}
            onBodyDraftChange={setBodyDraft}
            onConfirmDelete={handleConfirmDelete}
            onCreateEdge={handleCreateEdge}
            onDeleteEdge={handleDeleteEdge}
            onRequestDelete={handleRequestDelete}
            onSave={handleSave}
            onTitleDraftChange={setTitleDraft}
            titleDraft={titleDraft}
          />
        </Inspector>
      </div>
    </div>
  );
}

let fallbackEdgeCounter = 0;

function createEdgeId(sourceId: string, targetId: string, relation: string) {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  fallbackEdgeCounter += 1;

  return `edge-${sourceId}-${targetId}-${slug(relation)}-${Date.now()}-${fallbackEdgeCounter}`;
}

function normalizeBody(body: string) {
  const trimmed = body.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function upsertEdge(edges: MemoryGraph["edges"], nextEdge: MemoryGraph["edges"][number]) {
  const existingIndex = edges.findIndex(
    (edge) =>
      edge.id === nextEdge.id ||
      (edge.sourceId === nextEdge.sourceId &&
        edge.targetId === nextEdge.targetId &&
        edge.relation === nextEdge.relation),
  );

  if (existingIndex === -1) {
    return [...edges, nextEdge];
  }

  return edges.map((edge, index) => (index === existingIndex ? nextEdge : edge));
}

function buildVisibleGraph(
  graph: MemoryGraph,
  selectedNodeId: string | null,
  searchQuery: string,
  filterKind: string,
  viewMode: "focused" | "full",
) {
  const selectedId = selectedNodeId;
  const depthByNodeId = buildDepthMap(graph, selectedId);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleNodeIds = new Set(
    graph.nodes
      .filter((node) => {
        const matchesKind = filterKind === "all" || node.kind === filterKind;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          node.title.toLowerCase().includes(normalizedQuery) ||
          (node.body ?? "").toLowerCase().includes(normalizedQuery);
        const insideFocusedView =
          viewMode === "full" || (depthByNodeId[node.id] ?? 3) <= 2;

        return matchesKind && matchesQuery && insideFocusedView;
      })
      .map((node) => node.id),
  );

  const visibleNodes = graph.nodes.filter((node) => visibleNodeIds.has(node.id));
  const visibleEdges = graph.edges.filter(
    (edge) => visibleNodeIds.has(edge.sourceId) && visibleNodeIds.has(edge.targetId),
  );

  return {
    depthByNodeId,
    graph: {
      edges: visibleEdges,
      nodes: visibleNodes,
    },
  };
}

function buildDepthMap(graph: MemoryGraph, selectedNodeId: string | null) {
  const depthByNodeId: Record<string, number> = {};

  for (const node of graph.nodes) {
    depthByNodeId[node.id] = 3;
  }

  if (!selectedNodeId) {
    return depthByNodeId;
  }

  const adjacency = new Map<string, string[]>();

  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of graph.edges) {
    adjacency.set(edge.sourceId, [...(adjacency.get(edge.sourceId) ?? []), edge.targetId]);
    adjacency.set(edge.targetId, [...(adjacency.get(edge.targetId) ?? []), edge.sourceId]);
  }

  const queue: Array<{ depth: number; id: string }> = [{ depth: 0, id: selectedNodeId }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id) || current.depth > 2) {
      continue;
    }

    visited.add(current.id);
    depthByNodeId[current.id] = current.depth;

    for (const neighborId of adjacency.get(current.id) ?? []) {
      if (!visited.has(neighborId)) {
        queue.push({ depth: current.depth + 1, id: neighborId });
      }
    }
  }

  return depthByNodeId;
}

function centerPan(point: { x: number; y: number }, zoom: number) {
  return {
    x: canvasSize.width / 2 - (point.x + nodeSize.width / 2) * zoom,
    y: canvasSize.height / 2 - (point.y + nodeSize.height / 2) * zoom,
  };
}

function fitGraph(nodes: MemoryGraph["nodes"]) {
  const layout = buildLayout(nodes);
  const points = nodes
    .map((node) => layout.get(node.id))
    .filter((point): point is { x: number; y: number } => Boolean(point));

  if (points.length === 0) {
    return { pan: defaultView, zoom: defaultZoom };
  }

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x + nodeSize.width));
  const maxY = Math.max(...points.map((point) => point.y + nodeSize.height));
  const width = Math.max(maxX - minX, nodeSize.width);
  const height = Math.max(maxY - minY, nodeSize.height);
  const nextZoom = clamp(
    Math.min(
      (canvasSize.width - 160) / width,
      (canvasSize.height - 160) / height,
      1.15,
    ),
    0.55,
    1.8,
  );

  return {
    pan: {
      x: (canvasSize.width - width * nextZoom) / 2 - minX * nextZoom,
      y: (canvasSize.height - height * nextZoom) / 2 - minY * nextZoom,
    },
    zoom: nextZoom,
  };
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "link";
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
