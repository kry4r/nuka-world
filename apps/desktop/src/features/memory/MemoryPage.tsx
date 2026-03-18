import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import {
  MemoryGraphCanvas,
  buildLayout,
  canvasSize,
  nodeSize,
} from "./MemoryGraphCanvas";
import { MemoryGraphControls } from "./MemoryGraphControls";
import { MemoryNodeInspector } from "./MemoryNodeInspector";

const defaultView = { x: 72, y: 52 };
const defaultZoom = 1;
type ViewportSize = { height: number; width: number };
const MEMORY_KIND_OPTIONS = [
  { label: "全部", value: "all" },
  { label: "流程", value: "workflow" },
  { label: "对话", value: "session" },
  { label: "智能体", value: "agent" },
  { label: "回复", value: "message" },
  { label: "要点", value: "fact" },
] as const;

export function MemoryPage() {
  const canvasFrameRef = useRef<HTMLDivElement | null>(null);
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
  const [viewportSize, setViewportSize] =
    useState<ViewportSize>(canvasSize);
  const [zoom, setZoom] = useState(defaultZoom);
  const [deleteReview, setDeleteReview] = useState<{
    connectedTitles: string[];
    edgeCount: number;
    nodeId: string;
  } | null>(null);

  useLayoutEffect(() => {
    let alive = true;

    void listMemoryScopes()
      .then((items) => {
        if (!alive) {
          return;
        }

        setScopes(items);
        setScopesLoaded(true);
      })
      .catch((reason) => {
        if (!alive) {
          return;
        }

        setScopesLoaded(true);
        setLoadError(
          reason instanceof Error
            ? reason.message
            : "Failed to load memory scopes.",
        );
      });

    return () => {
      alive = false;
    };
  }, [graph.nodes.length]);

  useEffect(() => {
    const frame = canvasFrameRef.current;
    if (!frame) {
      return;
    }

    let animationFrame = 0;

    const measure = () => {
      const rect = frame.getBoundingClientRect();
      const nextWidth = Math.max(320, Math.round(rect.width));
      const nextHeight = Math.max(320, Math.round(rect.height));

      if (nextWidth === 320 && nextHeight === 320 && rect.width === 0) {
        return;
      }

      setViewportSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    };
    const scheduleMeasure = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(measure);
    };

    measure();

    const ResizeObserverCtor = globalThis.ResizeObserver;
    const resizeObserver = ResizeObserverCtor
      ? new ResizeObserverCtor(scheduleMeasure)
      : null;

    resizeObserver?.observe(frame);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
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
        const nextLayout = buildLayout(
          nextGraph.nodes,
          nextGraph.edges,
          nextSelectedNodeId,
        );
        const nextPoint = nextSelectedNodeId
          ? nextLayout.get(nextSelectedNodeId)
          : null;
        const nextViewport =
          nextGraph.nodes.length <= 2
            ? fitGraph(
                nextGraph.nodes,
                nextGraph.edges,
                nextSelectedNodeId,
                resolveViewportSize(canvasFrameRef.current, viewportSize),
              )
            : nextPoint
              ? {
                  pan: centerPan(
                    nextPoint,
                    defaultZoom,
                    resolveViewportSize(canvasFrameRef.current, viewportSize),
                  ),
                  zoom: defaultZoom,
                }
              : null;

        setGraph(nextGraph);
        setSelectedNodeId(nextSelectedNodeId);
        if (nextViewport) {
          setPan(nextViewport.pan);
          setZoom(nextViewport.zoom);
        } else {
          setPan(defaultView);
          setZoom(defaultZoom);
        }
      })
      .catch((reason) => {
        if (!alive) {
          return;
        }

        setLoadError(
          reason instanceof Error
            ? reason.message
            : "Failed to load memory graph.",
        );
      });

    return () => {
      alive = false;
    };
  }, [selectedScopeId]);

  const scopeOptions = useMemo(
    () =>
      scopes
        .sort((left, right) => {
          const leftRank = scopePriority(left);
          const rightRank = scopePriority(right);

          if (leftRank === rightRank) {
            return left.title.localeCompare(right.title);
          }

          return leftRank - rightRank;
        })
        .map((scope) => ({
          id: scope.id,
          label: scopeLabel(scope),
        })),
    [scopes],
  );
  const ownerSections = useMemo(() => buildOwnerSections(scopes), [scopes]);

  useEffect(() => {
    const preferredScopeId =
      ownerSections.flatMap((section) => section.owners)[0]?.id ??
      scopeOptions[0]?.id ??
      null;

    if (!preferredScopeId) {
      if (selectedScopeId !== null) {
        setSelectedScopeId(null);
      }
      return;
    }

    if (
      !selectedScopeId ||
      !scopeOptions.some((scope) => scope.id === selectedScopeId)
    ) {
      setSelectedScopeId(preferredScopeId);
    }
  }, [ownerSections, scopeOptions, selectedScopeId]);

  const visibleState = useMemo(
    () => buildVisibleGraph(graph, selectedNodeId, searchQuery, filterKind),
    [filterKind, graph, searchQuery, selectedNodeId],
  );
  const layout = useMemo(
    () =>
      buildLayout(
        visibleState.graph.nodes,
        visibleState.graph.edges,
        selectedNodeId,
      ),
    [selectedNodeId, visibleState.graph.edges, visibleState.graph.nodes],
  );
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

      if (
        current &&
        visibleState.graph.nodes.some((node) => node.id === current)
      ) {
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
      setPan(
        centerPan(
          point,
          zoom,
          resolveViewportSize(canvasFrameRef.current, viewportSize),
        ),
      );
    }
  }, [selectedNode?.id, selectedNodePositionKey, viewportSize, zoom]);

  useEffect(() => {
    if (
      visibleState.graph.nodes.length === 0 ||
      visibleState.graph.nodes.length > 2
    ) {
      return;
    }

    const { pan: fitPan, zoom: fitZoom } = fitGraph(
      visibleState.graph.nodes,
      visibleState.graph.edges,
      selectedNode?.id ?? selectedNodeId,
      resolveViewportSize(canvasFrameRef.current, viewportSize),
    );
    setPan(fitPan);
    setZoom(fitZoom);
  }, [
    filterKind,
    searchQuery,
    selectedNode?.id,
    selectedNodeId,
    visibleNodeIdsKey,
    visibleState.graph.edges,
    visibleState.graph.nodes,
    viewportSize,
  ]);

  useEffect(() => {
    setTitleDraft(selectedNode?.title ?? "");
    setBodyDraft(selectedNode?.body ?? "");
  }, [selectedNode?.id, selectedNode?.title, selectedNode?.body]);

  const connectedEdges = selectedNode
    ? graph.edges.filter(
        (edge) =>
          edge.sourceId === selectedNode.id ||
          edge.targetId === selectedNode.id,
      )
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
        nodes: current.nodes.map((node) =>
          node.id === updatedNode.id ? updatedNode : node,
        ),
      }));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Failed to update node.",
      );
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
        const peerId =
          edge.sourceId === selectedNode.id ? edge.targetId : edge.sourceId;
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
          (edge) =>
            edge.sourceId !== selectedNode.id &&
            edge.targetId !== selectedNode.id,
        ),
        nodes: current.nodes.filter((node) => node.id !== selectedNode.id),
      }));
      setDeleteReview(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Failed to delete node.",
      );
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
      setError(
        reason instanceof Error ? reason.message : "Failed to create edge.",
      );
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
      setError(
        reason instanceof Error ? reason.message : "Failed to delete edge.",
      );
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
      setPan(
        centerPan(
          point,
          zoom,
          resolveViewportSize(canvasFrameRef.current, viewportSize),
        ),
      );
    }
  };

  const handleFitView = () => {
    if (visibleState.graph.nodes.length === 0) {
      setPan(defaultView);
      setZoom(defaultZoom);
      return;
    }

    const { pan: fitPan, zoom: fitZoom } = fitGraph(
      visibleState.graph.nodes,
      visibleState.graph.edges,
      selectedNode?.id ?? selectedNodeId,
      resolveViewportSize(canvasFrameRef.current, viewportSize),
    );
    setPan(fitPan);
    setZoom(fitZoom);
  };

  return (
    <div className="page-layout memory-page">
      <div className="page-layout__body memory-page__body">
        <aside className="memory-owner-rail" data-testid="memory-owner-rail">
          {ownerSections.map((section) => (
            <section className="memory-owner-rail__section" key={section.title}>
              <span className="memory-owner-rail__heading">
                {section.title}
              </span>
              <div className="memory-owner-rail__list">
                {section.owners.length === 0 ? (
                  <span className="memory-owner-rail__empty">
                    还没有协作团队记忆
                  </span>
                ) : (
                  section.owners.map((owner) => (
                    <button
                      aria-pressed={selectedScopeId === owner.id}
                      className={`memory-owner-rail__item${selectedScopeId === owner.id ? " is-active" : ""}`}
                      key={owner.id}
                      onClick={() => {
                        setSelectedScopeId(owner.id);
                        setDetailOpen(false);
                        setDeleteReview(null);
                        setError(null);
                        setFilterKind("all");
                        setSearchQuery("");
                      }}
                      type="button"
                    >
                      <span className="memory-owner-rail__item-label">
                        {owner.label}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>
          ))}
        </aside>

        <div className="memory-page__main">
          {loadError ? (
            <section className="memory-empty-state memory-empty-state--error">
              <span className="memory-page__eyebrow">记忆</span>
              <h1>记忆图暂时不可用</h1>
              <p>{loadError}</p>
            </section>
          ) : (scopesLoaded && scopeOptions.length === 0) ||
            graph.nodes.length === 0 ? (
            <div
              className="memory-page__empty-copy"
              data-testid="memory-empty-copy"
            >
              还没有记忆节点
            </div>
          ) : (
            <>
              <section className="memory-stage">
                <div className="memory-stage__controls">
                  <MemoryGraphControls
                    filterKind={filterKind}
                    kindOptions={[...MEMORY_KIND_OPTIONS]}
                    onFilterKindChange={setFilterKind}
                    onSearchQueryChange={setSearchQuery}
                    searchQuery={searchQuery}
                  />
                </div>

                <div className="memory-stage__canvas memory-stage__canvas--fill">
                  {visibleState.graph.nodes.length === 0 ? (
                    <Card
                      description="换个搜索词或筛选条件，把匹配的记忆节点找回来。"
                      title="还没有记忆节点"
                      tone="soft"
                    />
                  ) : (
                    <div
                      className="memory-stage__canvas-frame memory-stage__canvas-frame--fill"
                      ref={canvasFrameRef}
                    >
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
                        onZoomIn={() =>
                          setZoom((current) => Math.min(1.8, current + 0.12))
                        }
                        onZoomOut={() =>
                          setZoom((current) => Math.max(0.55, current - 0.12))
                        }
                        pan={pan}
                        selectedNodeId={selectedNode?.id ?? null}
                        selectedNodeTitle={selectedNode?.title ?? null}
                        workbenchView={workbenchView}
                        zoom={zoom}
                      />

                      {detailOpen && selectedNode ? (
                        <aside
                          className="memory-node-overlay memory-node-overlay--popover"
                          data-detail-presentation="popover"
                          data-testid="memory-node-detail"
                        >
                          <MemoryNodeInspector
                            bodyDraft={bodyDraft}
                            busy={busy}
                            connectedEdges={connectedEdges}
                            deleteImpact={
                              deleteReview &&
                              deleteReview.nodeId === selectedNode?.id
                                ? {
                                    connectedTitles:
                                      deleteReview.connectedTitles,
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

function scopePriority(scope: MemoryScope) {
  if (scope.kind === "session" && scope.workflowId?.startsWith("team:")) {
    return 0;
  }

  if (scope.kind === "workflow" && scope.workflowId?.startsWith("team:")) {
    return 1;
  }

  if (scope.kind === "agent") {
    return 2;
  }

  if (scope.kind === "session") {
    return 3;
  }

  if (scope.kind === "workflow") {
    return 4;
  }

  if (scope.kind === "world") {
    return 5;
  }

  return 6;
}

function scopeLabel(scope: MemoryScope) {
  if (scope.kind === "world") {
    return "对话";
  }

  if (scope.kind === "session") {
    return `${scope.workflowId?.startsWith("team:") ? "协作运行" : "对话"} · ${scope.title}`;
  }

  if (scope.kind === "workflow") {
    return `${scope.workflowId?.startsWith("team:") ? "协作团队" : "流程"} · ${scope.title}`;
  }

  if (scope.kind === "agent") {
    return `智能体 · ${scope.title}`;
  }

  return scope.title;
}

function buildOwnerSections(scopes: MemoryScope[]) {
  const directScopes: MemoryScope[] = [];
  const teamOwners: Array<{ id: string; label: string }> = [];

  for (const scope of scopes.sort(
    (left, right) => scopePriority(left) - scopePriority(right),
  )) {
    if (scope.workflowId?.startsWith("team:")) {
      teamOwners.push({
        id: scope.id,
        label: normalizeOwnerLabel(scope),
      });
      continue;
    }

    directScopes.push(scope);
  }

  const directOwners =
    directScopes.length === 0
      ? []
      : [
          {
            id: selectDirectOwnerScope(directScopes).id,
            label: "对话",
          },
        ];

  return [
    {
      title: "对话",
      owners: directOwners,
    },
    {
      title: "协作团队",
      owners: teamOwners,
    },
  ];
}

function normalizeOwnerLabel(scope: MemoryScope) {
  if (scope.workflowId?.startsWith("team:")) {
    const rawTeamTitle = scope.title.trim();
    const looksLikeRawTeamId =
      /^team[\s-]+[0-9a-f]{8}\b(?:[\s-]+[0-9a-f]{4,})+$/i.test(rawTeamTitle);
    const teamKey =
      scope.workflowId.match(/^team:([0-9a-f]{8})/i)?.[1] ??
      rawTeamTitle.match(/^team[\s-]+([0-9a-f]{8})/i)?.[1] ??
      null;

    if (looksLikeRawTeamId && teamKey) {
      return `协作团队 ${teamKey.toLowerCase()}`;
    }

    return scope.title;
  }

  return scope.title;
}

function selectDirectOwnerScope(scopes: MemoryScope[]) {
  return (
    scopes.find((scope) => scope.kind === "session") ??
    scopes.find((scope) => scope.kind === "workflow") ??
    scopes.find((scope) => scope.kind === "world") ??
    scopes[0]!
  );
}

function upsertEdge(
  edges: MemoryGraph["edges"],
  nextEdge: MemoryGraph["edges"][number],
) {
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

  return edges.map((edge, index) =>
    index === existingIndex ? nextEdge : edge,
  );
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

  const visibleNodes = graph.nodes.filter((node) =>
    visibleNodeIds.has(node.id),
  );
  const visibleEdges = graph.edges.filter(
    (edge) =>
      visibleNodeIds.has(edge.sourceId) && visibleNodeIds.has(edge.targetId),
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
    adjacency.set(edge.sourceId, [
      ...(adjacency.get(edge.sourceId) ?? []),
      edge.targetId,
    ]);
    adjacency.set(edge.targetId, [
      ...(adjacency.get(edge.targetId) ?? []),
      edge.sourceId,
    ]);
  }

  const queue: Array<{ depth: number; id: string }> = [
    { depth: 0, id: selectedNodeId },
  ];
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

export function centerPan(
  point: { x: number; y: number },
  zoom: number,
  viewport: ViewportSize,
) {
  return {
    x: viewport.width / 2 - (point.x + nodeSize.width / 2) * zoom,
    y: viewport.height / 2 - (point.y + nodeSize.height / 2) * zoom,
  };
}

export function fitGraph(
  nodes: MemoryGraph["nodes"],
  edges: MemoryGraph["edges"] = [],
  focusTargetId: string | null = null,
  viewport: ViewportSize = canvasSize,
) {
  const layout = buildLayout(nodes, edges, focusTargetId);
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
  const maxFitZoom =
    points.length === 1 ? 1.8 : points.length === 2 ? 1.45 : 1.15;
  const nextZoom = clamp(
    Math.min(
      (viewport.width - 160) / width,
      (viewport.height - 160) / height,
      maxFitZoom,
    ),
    0.55,
    1.8,
  );

  return {
    pan: {
      x: (viewport.width - width * nextZoom) / 2 - minX * nextZoom,
      y: (viewport.height - height * nextZoom) / 2 - minY * nextZoom,
    },
    zoom: nextZoom,
  };
}

function slug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "link"
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolveViewportSize(
  frame: HTMLDivElement | null,
  fallback: ViewportSize,
): ViewportSize {
  if (!frame) {
    return fallback;
  }

  const rect = frame.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

  if (width <= 0 || height <= 0) {
    return fallback;
  }

  return {
    width,
    height,
  };
}
