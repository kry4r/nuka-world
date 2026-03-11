import { startTransition, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import {
  createMemoryEdge,
  deleteMemoryEdge,
  deleteMemoryNode,
  listMemoryScopes,
  loadMemoryGraph,
  type MemoryGraph,
  type MemoryScope,
  updateMemoryNode,
} from "@/lib/memory";
import { MemoryGraphCanvas, buildLayout, canvasSize, nodeSize } from "./MemoryGraphCanvas";
import { MemoryGraphControls } from "./MemoryGraphControls";
import { MemoryNodeInspector } from "./MemoryNodeInspector";

const defaultView = { x: 72, y: 52 };
const defaultZoom = 1;

export function MemoryPage() {
  const [graph, setGraph] = useState<MemoryGraph>({ nodes: [], edges: [] });
  const [scopes, setScopes] = useState<MemoryScope[]>([]);
  const [scopesLoaded, setScopesLoaded] = useState(false);
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
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

    void listMemoryScopes()
      .then((items) => {
        if (!alive) {
          return;
        }

        startTransition(() => {
          setScopes(items);
          setScopesLoaded(true);
        });
      })
      .catch((reason) => {
        if (!alive) {
          return;
        }

        setScopesLoaded(true);
        setLoadError(reason instanceof Error ? reason.message : "Failed to load memory scopes.");
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedScopeId) {
      setGraph({ nodes: [], edges: [] });
      setSelectedNodeId(null);
      return;
    }

    let alive = true;

    setLoadError(null);

    void loadMemoryGraph(selectedScopeId)
      .then((nextGraph) => {
        if (!alive) {
          return;
        }

        const nextSelectedNodeId = nextGraph.nodes[0]?.id ?? null;
        const nextLayout = buildLayout(nextGraph.nodes);
        const nextPoint = nextSelectedNodeId ? nextLayout.get(nextSelectedNodeId) : null;
        const nextViewport =
          nextGraph.nodes.length <= 2
            ? fitGraph(nextGraph.nodes)
            : nextPoint
              ? { pan: centerPan(nextPoint, defaultZoom), zoom: defaultZoom }
              : null;

        startTransition(() => {
          setGraph(nextGraph);
          setSelectedNodeId(nextSelectedNodeId);
          if (nextViewport) {
            setPan(nextViewport.pan);
            setZoom(nextViewport.zoom);
          } else {
            setPan(defaultView);
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
  }, [selectedScopeId]);

  const scopeOptions = useMemo(
    () =>
      scopes
        .filter((scope) => scope.kind === "world" || scope.kind === "workflow")
        .sort((left, right) => {
          if (left.kind === right.kind) {
            return left.title.localeCompare(right.title);
          }

          if (left.kind === "workflow") {
            return -1;
          }

          if (right.kind === "workflow") {
            return 1;
          }

          return left.title.localeCompare(right.title);
        })
        .map((scope) => ({
          id: scope.id,
          label: scope.title,
        })),
    [scopes],
  );

  useEffect(() => {
    const preferredScopeId = scopeOptions[0]?.id ?? null;

    if (!preferredScopeId) {
      if (selectedScopeId !== null) {
        setSelectedScopeId(null);
      }
      return;
    }

    if (!selectedScopeId || !scopeOptions.some((scope) => scope.id === selectedScopeId)) {
      setSelectedScopeId(preferredScopeId);
    }
  }, [scopeOptions, selectedScopeId]);

  const visibleState = useMemo(
    () => buildVisibleGraph(graph, selectedNodeId, searchQuery, filterKind),
    [filterKind, graph, searchQuery, selectedNodeId],
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
  const visibleNodeIdsKey = useMemo(
    () => visibleState.graph.nodes.map((node) => node.id).join("|"),
    [visibleState.graph.nodes],
  );

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
      setDetailOpen(false);
    }
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
    if (visibleState.graph.nodes.length === 0 || visibleState.graph.nodes.length > 2) {
      return;
    }

    const { pan: fitPan, zoom: fitZoom } = fitGraph(visibleState.graph.nodes);
    setPan(fitPan);
    setZoom(fitZoom);
  }, [filterKind, searchQuery, visibleNodeIdsKey, visibleState.graph.nodes]);

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
    setDetailOpen(true);
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
    <div className="page-layout memory-page">
      <div className="page-layout__body memory-page__body">
        <div className="memory-page__main">
          {loadError ? (
            <section className="memory-empty-state memory-empty-state--error">
              <span className="memory-page__eyebrow">Memory</span>
              <h1>Memory graph unavailable</h1>
              <p>{loadError}</p>
            </section>
          ) : (scopesLoaded && scopeOptions.length === 0) || graph.nodes.length === 0 ? (
            <div className="memory-page__empty-copy" data-testid="memory-empty-copy">
              No graph nodes yet
            </div>
          ) : (
            <>
              <section className="memory-stage">
                <div className="memory-stage__controls">
                  <MemoryGraphControls
                    filterKind={filterKind}
                    onFilterKindChange={setFilterKind}
                    onSearchQueryChange={setSearchQuery}
                    onScopeIdChange={(nextScopeId) => {
                      setSelectedScopeId(nextScopeId);
                      setDetailOpen(false);
                      setDeleteReview(null);
                      setError(null);
                      setFilterKind("all");
                      setSearchQuery("");
                    }}
                    searchQuery={searchQuery}
                    scopeOptions={scopeOptions}
                    selectedScopeId={selectedScopeId ?? ""}
                  />
                </div>

                <div className="memory-stage__canvas memory-stage__canvas--fill">
                  {visibleState.graph.nodes.length === 0 ? (
                    <Card
                      description="Adjust the current search or filter to bring matching memory nodes back into view."
                      title="No graph nodes yet"
                      tone="soft"
                    />
                  ) : (
                    <div className="memory-stage__canvas-frame memory-stage__canvas-frame--fill">
                      <MemoryGraphCanvas
                        depthByNodeId={visibleState.depthByNodeId}
                        focusTargetId={selectedNode?.id ?? null}
                        graph={visibleState.graph}
                        onFitView={handleFitView}
                        onPanChange={setPan}
                        onFocusSelected={handleFocusSelected}
                        onSelectNode={handleSelectNode}
                        onWorkbenchViewChange={setWorkbenchView}
                        onZoomChange={setZoom}
                        onZoomIn={() => setZoom((current) => Math.min(1.8, current + 0.12))}
                        onZoomOut={() => setZoom((current) => Math.max(0.55, current - 0.12))}
                        pan={pan}
                        selectedNodeId={selectedNode?.id ?? null}
                        selectedNodeTitle={selectedNode?.title ?? null}
                        workbenchView={workbenchView}
                        zoom={zoom}
                      />

                      {detailOpen && selectedNode ? (
                        <aside className="memory-node-overlay" data-testid="memory-node-detail">
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
                            onClose={() => setDetailOpen(false)}
                            onConfirmDelete={handleConfirmDelete}
                            onCreateEdge={handleCreateEdge}
                            onDeleteEdge={handleDeleteEdge}
                            onRequestDelete={handleRequestDelete}
                            onSave={handleSave}
                            onTitleDraftChange={setTitleDraft}
                            titleDraft={titleDraft}
                          />
                        </aside>
                      ) : null}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
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

        return matchesKind && matchesQuery;
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
  const maxFitZoom = points.length === 1 ? 1.8 : points.length === 2 ? 1.45 : 1.15;
  const nextZoom = clamp(
    Math.min(
      (canvasSize.width - 160) / width,
      (canvasSize.height - 160) / height,
      maxFitZoom,
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
