import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/styles/tokens.css";
import "@/styles/theme.css";
import { MemoryPage } from "./MemoryPage";
import { buildLayout } from "./MemoryGraphCanvas";
import { findText, renderIntoDocument } from "@/test/render";

const { invokeMock, resetMocks, graphState } = vi.hoisted(() => {
  const initialNodes: Array<{
    body: string | null;
    consolidationState: string;
    id: string;
    kind: string;
    scopeId: string;
    traceType: string;
    title: string;
  }> = [
      {
        id: "workflow-review",
        kind: "workflow",
        scopeId: "workflow:workflow-review",
        title: "Release Workflow",
        body: "Coordinates release validation.",
        traceType: "semantic",
        consolidationState: "approved",
      },
      {
        id: "fact-archive",
        kind: "fact",
        scopeId: "world",
        title: "Archive Fact",
        body: "Older note kept for comparison.",
        traceType: "semantic",
        consolidationState: "archived",
      },
      {
        id: "memory-review",
        kind: "fact",
        scopeId: "workflow:workflow-review",
        title: "Review Memory",
        body: "Tracks the latest review conclusions.",
        traceType: "episodic",
        consolidationState: "candidate",
      },
      {
        id: "session-sync",
        kind: "session",
        scopeId: "workflow:workflow-review",
        title: "Review Session",
        body: "Tracks the active review conversation.",
        traceType: "working",
        consolidationState: "none",
      },
      {
        id: "agent-scout",
        kind: "agent",
        scopeId: "workflow:workflow-review",
        title: "Scout Agent",
        body: "Flags follow-up work.",
        traceType: "semantic",
        consolidationState: "rejected",
      },
    ];

  const initialScopes = [
    {
      id: "world",
      title: "World",
      kind: "world",
      workflowId: null,
      sessionId: null,
      agentId: null,
    },
    {
      id: "workflow:workflow-review",
      title: "Release Workflow",
      kind: "workflow",
      workflowId: "workflow-review",
      sessionId: null,
      agentId: null,
    },
  ];

  const initialEdges = [
      {
        id: "edge-review",
        sourceId: "workflow-review",
        targetId: "memory-review",
        relation: "captures",
      },
      {
        id: "edge-session",
        sourceId: "memory-review",
        targetId: "session-sync",
        relation: "informs",
      },
      {
        id: "edge-agent",
        sourceId: "session-sync",
        targetId: "agent-scout",
        relation: "routes_to",
      },
    ];

  const graphState: {
    edges: typeof initialEdges;
    nodes: typeof initialNodes;
  } = {
    nodes: structuredClone(initialNodes),
    edges: structuredClone(initialEdges),
  };
  let scopeState = structuredClone(initialScopes);

  const serializeGraph = (scopeId?: string) => {
    const visibleNodes = scopeId
      ? graphState.nodes.filter((node) => node.scopeId === scopeId)
      : graphState.nodes;
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));

    return {
      nodes: visibleNodes.map(({ scopeId: _scopeId, ...node }) => ({ ...node })),
      edges: graphState.edges.filter(
        (edge) => visibleNodeIds.has(edge.sourceId) && visibleNodeIds.has(edge.targetId),
      ),
    };
  };

  const invokeMock = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case "load_memory_graph":
        return serializeGraph(
          typeof args?.scopeId === "string" ? args.scopeId : undefined,
        );
      case "list_memory_scopes":
        return structuredClone(scopeState);
      case "list_memory_by_workflow": {
        const workflowId = String(args?.workflowId ?? "");
        return scopeState.filter((scope) => scope.workflowId === workflowId);
      }
      case "get_memory_node_detail": {
        const nodeId = String(args?.nodeId ?? "");
        const node = graphState.nodes.find((entry) => entry.id === nodeId);
        if (!node) {
          return null;
        }
        return {
          id: node.id,
          title: node.title,
          kind: node.kind,
          body: node.body,
          traceType: node.traceType,
          consolidationState: node.consolidationState,
          relatedIds: graphState.edges
            .filter((edge) => edge.sourceId === node.id || edge.targetId === node.id)
            .flatMap((edge) => [edge.sourceId, edge.targetId].filter((id) => id !== node.id)),
          workflowId: node.kind === "workflow" ? node.id : null,
          sessionId: null,
          agentId: null,
        };
      }
      case "update_memory_node": {
        const nodeId = String(args?.nodeId ?? "");
        const title = String(args?.title ?? "");
        const bodyArg = args?.body;
        const body = typeof bodyArg === "string" ? bodyArg : bodyArg == null ? null : String(bodyArg);
        const node = graphState.nodes.find((entry) => entry.id === nodeId);
        if (!node) {
          throw new Error(`unknown node: ${nodeId}`);
        }
        node.title = title;
        node.body = body;
        return { ...node };
      }
      case "delete_memory_node": {
        const nodeId = String(args?.nodeId ?? "");
        graphState.nodes = graphState.nodes.filter((entry) => entry.id !== nodeId);
        graphState.edges = graphState.edges.filter(
          (edge) => edge.sourceId !== nodeId && edge.targetId !== nodeId,
        );
        return null;
      }
      case "create_memory_edge": {
        const sourceId = String(args?.sourceId ?? "");
        const targetId = String(args?.targetId ?? "");
        const relation = String(args?.relation ?? "");
        const existingEdge = graphState.edges.find(
          (edge) => edge.sourceId === sourceId && edge.targetId === targetId && edge.relation === relation,
        );
        if (existingEdge) {
          return { ...existingEdge };
        }

        const edge = {
          id: String(args?.edgeId ?? ""),
          sourceId,
          targetId,
          relation,
        };
        graphState.edges = [...graphState.edges, edge];
        return edge;
      }
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  });

  const resetMocks = () => {
    graphState.nodes = structuredClone(initialNodes);
    graphState.edges = structuredClone(initialEdges);
    scopeState = structuredClone(initialScopes);
    invokeMock.mockClear();
  };

  return { invokeMock, resetMocks, graphState };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();

  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

beforeEach(() => {
  resetMocks();
  vi.unstubAllGlobals();
});

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(text),
  );
}

function distanceBetween(
  left: { x: number; y: number },
  right: { x: number; y: number },
) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function setFormValue(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("MemoryPage", () => {
  it("switches between activation, consolidation, and schema views", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const canvas = view.container.querySelector('[data-testid="memory-graph-canvas"]');

    expect(findText(view.container, "活跃")).toBeTruthy();
    expect(findText(view.container, "沉淀")).toBeTruthy();
    expect(findText(view.container, "结构")).toBeTruthy();
    expect(canvas?.getAttribute("data-workbench-view")).toBe("activation");

    await act(async () => {
      findButton(view.container, "沉淀")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(canvas?.getAttribute("data-workbench-view")).toBe("consolidation");

    await act(async () => {
      findButton(view.container, "结构")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(canvas?.getAttribute("data-workbench-view")).toBe("schema");
  });

  it("renders trace and consolidation metadata on memory nodes", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const reviewNode = findButton(view.container, "Review Memory");
    const sessionNode = findButton(view.container, "Review Session");

    expect(reviewNode?.getAttribute("data-trace-type")).toBe("episodic");
    expect(reviewNode?.getAttribute("data-consolidation-state")).toBe("candidate");
    expect(sessionNode?.getAttribute("data-trace-type")).toBe("working");
    expect(sessionNode?.getAttribute("data-consolidation-state")).toBe("none");
  });

  it("does not render graph utilities or node inspector when the graph is empty", async () => {
    graphState.nodes = [];
    graphState.edges = [];

    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.container.textContent).not.toContain("Graph Utilities");
    expect(view.container.textContent).not.toContain("Node Inspector");
    expect(view.container.querySelector('[data-testid="memory-graph-utilities"]')).toBeFalsy();
    expect(view.container.querySelector('input[aria-label="Node title"]')).toBeFalsy();
  });

  it("auto-fits sparse graphs so a single node does not sit tiny in the canvas", async () => {
    graphState.nodes = [graphState.nodes[2]!];
    graphState.edges = [];

    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const canvas = view.container.querySelector('[data-testid="memory-graph-canvas"]');

    expect(Number(canvas?.getAttribute("data-zoom") ?? "0")).toBeGreaterThan(1.5);
  });

  it("auto-fits the selected workflow scope when search narrows the graph to one node", async () => {
    graphState.edges = [];

    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const searchInput = view.container.querySelector(
      'input[aria-label="Search graph"]',
    ) as HTMLInputElement | null;

    await act(async () => {
      if (!searchInput) {
        throw new Error("search input missing");
      }

      setFormValue(searchInput, "Review Memory");
      await Promise.resolve();
    });

    const canvas = view.container.querySelector('[data-testid="memory-graph-canvas"]');

    expect(canvas?.textContent).toContain("1");
    expect(canvas?.textContent).toContain("节点");
    expect(Number(canvas?.getAttribute("data-zoom") ?? "0")).toBeGreaterThan(1.5);
  });

  it("keeps only search and kind controls above the graph and moves owner selection out of the top controls", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const topControls = view.container.querySelector(".memory-stage__controls");
    const canvas = view.container.querySelector('[data-testid="memory-graph-canvas"]');

    expect(topControls?.querySelector('input[aria-label="Search graph"]')).toBeTruthy();
    expect(topControls?.querySelector('select[aria-label="Filter kind"]')).toBeTruthy();
    expect(topControls?.querySelector('select[aria-label="Memory scope"]')).toBeFalsy();
    expect(topControls?.querySelector('select[aria-label="View mode"]')).toBeFalsy();
    expect(topControls?.textContent).not.toContain("Focused graph");
    expect(topControls?.textContent).not.toContain("Full map");
    expect(topControls?.textContent).not.toContain("活跃");
    expect(topControls?.textContent).not.toContain("沉淀");
    expect(topControls?.textContent).not.toContain("结构");
    expect(topControls?.textContent).not.toContain("缩小");
    expect(topControls?.textContent).not.toContain("放大");
    expect(topControls?.textContent).not.toContain("适配");
    expect(topControls?.textContent).not.toContain("回到焦点");

    expect(canvas?.textContent).toContain("活跃");
    expect(canvas?.textContent).toContain("沉淀");
    expect(canvas?.textContent).toContain("结构");
    expect(canvas?.textContent).toContain("缩小");
    expect(canvas?.textContent).toContain("放大");
    expect(canvas?.textContent).toContain("适配");
    expect(canvas?.textContent).toContain("回到焦点");
    expect(view.container.querySelector('[data-flat-select="true"]')).toBeTruthy();
  });

  it("defaults to the first owner in the rail and switches graphs when selecting another owner", async () => {
    graphState.nodes = [
      {
        id: "direct-memory",
        kind: "fact",
        scopeId: "workflow:workflow-review",
        title: "Direct Memory",
        body: "Shared direct chat context.",
        traceType: "working",
        consolidationState: "candidate",
      },
      {
        id: "team-memory",
        kind: "fact",
        scopeId: "workflow:team:smoke-validation",
        title: "Team Memory",
        body: "Persistent team context.",
        traceType: "semantic",
        consolidationState: "approved",
      },
    ];
    graphState.edges = [];

    const currentImplementation = invokeMock.getMockImplementation();
    cleanups.push(async () => {
      if (currentImplementation) {
        invokeMock.mockImplementation(currentImplementation);
      }
    });
    (
      invokeMock as unknown as {
        mockImplementation: (
          implementation: (
            command: string,
            args?: Record<string, unknown>,
          ) => Promise<unknown>,
        ) => void;
      }
    ).mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "list_memory_scopes") {
        return [
          {
            id: "workflow:workflow-review",
            title: "对话",
            kind: "workflow",
            workflowId: "workflow-review",
            sessionId: null,
            agentId: null,
          },
          {
            id: "workflow:team:smoke-validation",
            title: "Smoke Validation Team",
            kind: "workflow",
            workflowId: "team:smoke-validation",
            sessionId: null,
            agentId: null,
          },
        ];
      }

      if (!currentImplementation) {
        throw new Error("default memory invoke implementation missing");
      }

      return currentImplementation(command, args);
    });

    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith("load_memory_graph", {
      scopeId: "workflow:workflow-review",
    });
    expect(findButton(view.container, "Direct Memory")).toBeTruthy();
    expect(findButton(view.container, "Team Memory")).toBeFalsy();

    const ownerRail = view.container.querySelector('[data-testid="memory-owner-rail"]');
    const ownerButtons = ownerRail?.querySelectorAll("button") ?? [];

    expect(ownerRail?.textContent).toContain("对话");
    expect(ownerButtons[0]?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      const teamOwner = Array.from(ownerButtons).find((node) =>
        node.textContent?.includes("Smoke Validation Team"),
      );
      if (!teamOwner) {
        throw new Error("team owner missing");
      }

      teamOwner.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith("load_memory_graph", {
      scopeId: "workflow:team:smoke-validation",
    });
    expect(findButton(view.container, "Direct Memory")).toBeFalsy();
    expect(findButton(view.container, "Team Memory")).toBeTruthy();
  });

  it("prioritizes run and team owners in the rail", async () => {
    graphState.nodes = [
      {
        id: "run-memory",
        kind: "fact",
        scopeId: "session:run-smoke",
        title: "Run Memory",
        body: "Tracks the active team follow-up.",
        traceType: "working",
        consolidationState: "candidate",
      },
      {
        id: "team-memory",
        kind: "fact",
        scopeId: "workflow:team:smoke-validation",
        title: "Team Memory",
        body: "Tracks persistent team context.",
        traceType: "semantic",
        consolidationState: "approved",
      },
      {
        id: "agent-memory",
        kind: "agent",
        scopeId: "agent:release-reviewer",
        title: "Release Reviewer",
        body: "Owns the release checklist.",
        traceType: "semantic",
        consolidationState: "approved",
      },
    ];
    graphState.edges = [];

    const currentImplementation = invokeMock.getMockImplementation();
    cleanups.push(async () => {
      if (currentImplementation) {
        invokeMock.mockImplementation(currentImplementation);
      }
    });
    (
      invokeMock as unknown as {
        mockImplementation: (
          implementation: (
            command: string,
            args?: Record<string, unknown>,
          ) => Promise<unknown>,
        ) => void;
      }
    ).mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "list_memory_scopes") {
        const scopeItems: Array<{
          agentId: string | null;
          id: string;
          kind: string;
          sessionId: string | null;
          title: string;
          workflowId: string | null;
        }> = [
          {
            id: "world",
            title: "World",
            kind: "world",
            workflowId: null,
            sessionId: null,
            agentId: null,
          },
          {
            id: "workflow:team:smoke-validation",
            title: "Smoke Validation Team",
            kind: "workflow",
            workflowId: "team:smoke-validation",
            sessionId: null,
            agentId: null,
          },
          {
            id: "session:run-smoke",
            title: "Smoke Validation Run",
            kind: "session",
            workflowId: "team:smoke-validation",
            sessionId: "run-smoke",
            agentId: null,
          },
          {
            id: "agent:release-reviewer",
            title: "Release Reviewer",
            kind: "agent",
            workflowId: null,
            sessionId: null,
            agentId: "agent-reviewer",
          },
        ];

        return scopeItems;
      }

      if (!currentImplementation) {
        throw new Error("default memory invoke implementation missing");
      }

      return currentImplementation(command, args);
    });

    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const ownerRail = view.container.querySelector('[data-testid="memory-owner-rail"]');
    const teamSection = Array.from(
      ownerRail?.querySelectorAll(".memory-owner-rail__section") ?? [],
    ).find((node) => node.textContent?.includes("协作团队"));
    const teamButtons = Array.from(teamSection?.querySelectorAll("button") ?? []);

    expect(ownerRail?.textContent).toContain("对话");
    expect(ownerRail?.textContent).toContain("协作团队");
    expect(teamButtons[0]?.textContent).toContain("Smoke Validation Run");
    expect(teamButtons[1]?.textContent).toContain("Smoke Validation Team");
    expect(view.container.querySelector('select[aria-label="Memory scope"]')).toBeFalsy();
  });

  it("renders a left owner rail for direct chat and teams instead of a scope dropdown", async () => {
    graphState.nodes = [
      {
        id: "direct-memory",
        kind: "fact",
        scopeId: "session:direct-shared",
        title: "Direct Memory",
        body: "Shared direct chat context.",
        traceType: "working",
        consolidationState: "candidate",
      },
      {
        id: "team-memory",
        kind: "fact",
        scopeId: "workflow:team:smoke-validation",
        title: "Team Memory",
        body: "Persistent team context.",
        traceType: "semantic",
        consolidationState: "approved",
      },
    ];
    graphState.edges = [];

    const currentImplementation = invokeMock.getMockImplementation();
    cleanups.push(async () => {
      if (currentImplementation) {
        invokeMock.mockImplementation(currentImplementation);
      }
    });
    (
      invokeMock as unknown as {
        mockImplementation: (
          implementation: (
            command: string,
            args?: Record<string, unknown>,
          ) => Promise<unknown>,
        ) => void;
      }
    ).mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "list_memory_scopes") {
        return [
          {
            id: "session:direct-shared",
            title: "对话",
            kind: "session",
            workflowId: "direct-chat",
            sessionId: "direct-shared",
            agentId: null,
          },
          {
            id: "workflow:team:smoke-validation",
            title: "Smoke Validation Team",
            kind: "workflow",
            workflowId: "team:smoke-validation",
            sessionId: null,
            agentId: null,
          },
        ];
      }

      if (!currentImplementation) {
        throw new Error("default memory invoke implementation missing");
      }

      return currentImplementation(command, args);
    });

    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const ownerRail = view.container.querySelector('[data-testid="memory-owner-rail"]');

    expect(ownerRail).toBeTruthy();
    expect(ownerRail?.textContent).toContain("对话");
    expect(ownerRail?.textContent).toContain("协作团队");
    expect(ownerRail?.textContent).toContain("Smoke Validation Team");
    expect(view.container.querySelector('select[aria-label="Memory scope"]')).toBeFalsy();
  });

  it("aliases world-scoped direct memory as 对话 in the owner rail", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const ownerRail = view.container.querySelector('[data-testid="memory-owner-rail"]');
    const directSection = Array.from(
      ownerRail?.querySelectorAll(".memory-owner-rail__section") ?? [],
    ).find((node) => node.textContent?.includes("对话"));

    expect(directSection?.textContent).toContain("对话");
    expect(ownerRail?.textContent).toContain("还没有协作团队记忆");
    expect(directSection?.textContent).not.toContain("World");
  });

  it("uses a graph-native surface and keeps network stats floating inside the canvas", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const canvas = view.container.querySelector('[data-testid="memory-graph-canvas"]');
    const selectedNode = findButton(view.container, "Review Memory");

    expect(canvas?.className).toContain("memory-graph");
    expect(canvas?.getAttribute("data-canvas-tone")).toBe("network");
    expect(selectedNode?.className).toContain("memory-graph__node");
    expect(view.container.querySelector(".memory-controls__summary")).toBeFalsy();
    expect(canvas?.textContent).toContain("节点");
    expect(canvas?.textContent).toContain("连线");
    expect(canvas?.textContent).toContain("缩放");
  });

  it("uses high-contrast type colors so workflow and fact nodes stay easy to distinguish", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const workflowNode = findButton(view.container, "Release Workflow") as HTMLElement | undefined;
    const factNode = findButton(view.container, "Review Memory") as HTMLElement | undefined;

    expect(workflowNode?.style.getPropertyValue("--memory-node-fill")).toBe("#2f8cff");
    expect(factNode?.style.getPropertyValue("--memory-node-fill")).toBe("#ffd84c");
  });

  it("renders graph nodes as dots with short labels and opens node details in a drawer surface", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const nodeButton = findButton(view.container, "Review Memory");

    expect(nodeButton?.getAttribute("data-node-shape")).toBe("dot");
    expect(nodeButton?.textContent).not.toContain("Tracks the latest review conclusions.");

    await act(async () => {
      nodeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const detail = view.container.querySelector('[data-testid="memory-node-detail"]');

    expect(detail?.getAttribute("data-detail-presentation")).toBe("drawer");
  });

  it("spreads same-kind graph nodes across the canvas instead of stacking them in one far-right column", async () => {
    graphState.nodes = Array.from({ length: 6 }, (_, index) => ({
      id: `fact-${index + 1}`,
      kind: "fact",
      scopeId: "workflow:workflow-review",
      title: `Fact ${index + 1}`,
      body: `Fact body ${index + 1}`,
      traceType: "working",
      consolidationState: "candidate",
    }));
    graphState.edges = [];

    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const nodes = Array.from(view.container.querySelectorAll(".memory-graph__node")) as HTMLElement[];
    const leftValues = nodes.map((node) => Number.parseInt(node.style.left, 10));
    const uniqueLeftValues = new Set(leftValues);

    expect(uniqueLeftValues.size).toBeGreaterThan(2);
    expect(Math.min(...leftValues)).toBeLessThan(520);
  });

  it("keeps directly connected nodes closer to the focus than disconnected nodes so the graph reads like a cluster", () => {
    const nodes = [
      {
        id: "focus",
        kind: "workflow",
        scopeId: "workflow:workflow-review",
        title: "Focus Workflow",
        body: "Primary focus node.",
        traceType: "semantic",
        consolidationState: "approved",
      },
      {
        id: "orphan-1",
        kind: "fact",
        scopeId: "workflow:workflow-review",
        title: "Orphan One",
        body: "Disconnected note.",
        traceType: "working",
        consolidationState: "candidate",
      },
      {
        id: "orphan-2",
        kind: "fact",
        scopeId: "workflow:workflow-review",
        title: "Orphan Two",
        body: "Disconnected note.",
        traceType: "working",
        consolidationState: "candidate",
      },
      {
        id: "orphan-3",
        kind: "fact",
        scopeId: "workflow:workflow-review",
        title: "Orphan Three",
        body: "Disconnected note.",
        traceType: "working",
        consolidationState: "candidate",
      },
      {
        id: "orphan-4",
        kind: "fact",
        scopeId: "workflow:workflow-review",
        title: "Orphan Four",
        body: "Disconnected note.",
        traceType: "working",
        consolidationState: "candidate",
      },
      {
        id: "orphan-5",
        kind: "fact",
        scopeId: "workflow:workflow-review",
        title: "Orphan Five",
        body: "Disconnected note.",
        traceType: "working",
        consolidationState: "candidate",
      },
      {
        id: "neighbor",
        kind: "session",
        scopeId: "workflow:workflow-review",
        title: "Connected Session",
        body: "Directly linked to the focus.",
        traceType: "episodic",
        consolidationState: "none",
      },
      {
        id: "neighbor-child",
        kind: "message",
        scopeId: "workflow:workflow-review",
        title: "Connected Reply",
        body: "Second hop from the focus.",
        traceType: "working",
        consolidationState: "candidate",
      },
    ];
    const edges = [
      {
        id: "edge-focus-neighbor",
        sourceId: "focus",
        targetId: "neighbor",
        relation: "routes_to",
      },
      {
        id: "edge-neighbor-child",
        sourceId: "neighbor",
        targetId: "neighbor-child",
        relation: "produces",
      },
    ];

    const layout = buildLayout(nodes as never, edges as never, "focus");
    const focusPoint = layout.get("focus");
    const neighborPoint = layout.get("neighbor");
    const orphanPoint = layout.get("orphan-1");

    expect(focusPoint).toBeTruthy();
    expect(neighborPoint).toBeTruthy();
    expect(orphanPoint).toBeTruthy();
    expect(distanceBetween(focusPoint!, neighborPoint!)).toBeLessThan(
      distanceBetween(focusPoint!, orphanPoint!),
    );
  });

  it("hides most non-focus labels in dense graphs so the canvas does not turn into a wall of overlapping text", async () => {
    graphState.nodes = Array.from({ length: 18 }, (_, index) => ({
      id: `memory-${index + 1}`,
      kind: index === 0 ? "workflow" : "fact",
      scopeId: "workflow:workflow-review",
      title: `Long Memory Label ${index + 1}`,
      body: `Dense graph node ${index + 1}`,
      traceType: index % 2 === 0 ? "semantic" : "working",
      consolidationState: "candidate",
    }));
    graphState.edges = graphState.nodes.slice(1).map((node, index) => ({
      id: `edge-${index + 1}`,
      sourceId: "memory-1",
      targetId: node.id,
      relation: "connects",
    }));

    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const nodes = Array.from(
      view.container.querySelectorAll(".memory-graph__node"),
    ) as HTMLElement[];
    const hiddenLabels = nodes.filter(
      (node) => node.getAttribute("data-label-visibility") === "hidden",
    );
    const visibleLabels = nodes.filter(
      (node) => node.getAttribute("data-label-visibility") === "full",
    );

    expect(visibleLabels[0]?.textContent).toContain("Long Memory Label 1");
    expect(hiddenLabels.length).toBeGreaterThan(6);
    expect(visibleLabels.length).toBeLessThan(nodes.length);
  });

  it("keeps the graph canvas primary while node detail opens as an overlay", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const canvas = view.container.querySelector('[data-testid="memory-graph-canvas"]');
    const canvasFrame = view.container.querySelector(".memory-stage__canvas-frame");
    const nodeButton = findButton(view.container, "Review Memory");

    expect(canvas).toBeTruthy();
    expect(view.container.querySelector(".memory-stage__header")).toBeFalsy();
    expect(view.container.textContent).not.toContain("Node Inspector");
    expect(view.container.textContent).not.toContain(
      "Search, filter, and inspect the graph without keeping a permanent side inspector open.",
    );
    expect(view.container.querySelector('[data-testid="memory-node-detail"]')).toBeFalsy();
    expect(view.container.querySelector('input[aria-label="Search graph"]')).toBeTruthy();
    expect(view.container.querySelector('select[aria-label="Filter kind"]')).toBeTruthy();
    expect(view.container.querySelector('select[aria-label="View mode"]')).toBeFalsy();

    await act(async () => {
      nodeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const detail = view.container.querySelector('[data-testid="memory-node-detail"]');

    expect(detail?.className).toContain("memory-node-overlay");
    expect(canvasFrame?.contains(detail ?? null)).toBe(true);
  });

  it("lets the canvas region stretch so the graph can fill the available page height", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const canvasRegion = view.container.querySelector(".memory-stage__canvas") as HTMLElement | null;
    const canvasFrame = view.container.querySelector(".memory-stage__canvas-frame") as HTMLElement | null;

    expect(canvasRegion).toBeTruthy();
    expect(canvasFrame).toBeTruthy();
    expect(canvasRegion?.className).toContain("memory-stage__canvas--fill");
    expect(canvasFrame?.className).toContain("memory-stage__canvas-frame--fill");
  });

  it("opens editable node detail fields in the overlay when selecting a node", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const nodeButton = findButton(view.container, "Review Memory");

    await act(async () => {
      nodeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const titleInput = view.container.querySelector('input[aria-label="Node title"]') as HTMLInputElement | null;
    const bodyInput = view.container.querySelector('textarea[aria-label="Node body"]') as HTMLTextAreaElement | null;

    expect(titleInput?.value).toBe("Review Memory");
    expect(bodyInput?.value).toBe("Tracks the latest review conclusions.");
    expect(view.container.querySelector('[data-testid="memory-node-detail"]')).toBeTruthy();
    expect(view.container.textContent).not.toContain("Node Inspector");
    expect(view.container.textContent).not.toContain(
      "Update local memory, review consolidation state, and manage connected edges inline.",
    );
  });

  it("renders a dedicated close button in the node detail header and dismisses the overlay", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      findButton(view.container, "Review Memory")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    const closeButton = view.container.querySelector(
      'button[aria-label="Close node detail"]',
    ) as HTMLButtonElement | null;

    expect(closeButton).toBeTruthy();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(view.container.querySelector('[data-testid="memory-node-detail"]')).toBeFalsy();
  });

  it("shows trace and consolidation metadata in the overlay", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      findButton(view.container, "Review Memory")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(findText(view.container, "记录类型")).toBeTruthy();
    expect(findText(view.container, "过程")).toBeTruthy();
    expect(findText(view.container, "沉淀状态")).toBeTruthy();
    expect(findText(view.container, "待整理")).toBeTruthy();
  });

  it("shows delete impact details before confirming node removal", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const nodeButton = findButton(view.container, "Review Memory");

    await act(async () => {
      nodeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const deleteButton = findButton(view.container, "删除节点");

    await act(async () => {
      deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(findText(view.container, "删除影响")).toBeTruthy();
    expect(findText(view.container, "会一起移除 2 条关联。")).toBeTruthy();
    expect(findText(view.container, "Release Workflow")).toBeTruthy();
    expect(findText(view.container, "Review Session")).toBeTruthy();
    expect(invokeMock).not.toHaveBeenCalledWith("delete_memory_node", expect.anything());

    const confirmDelete = findButton(view.container, "确认删除");

    await act(async () => {
      confirmDelete?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "delete_memory_node",
      expect.objectContaining({ nodeId: "memory-review" }),
    );
  });

  it("shows load errors instead of falling back to the empty graph state", async () => {
    invokeMock.mockImplementationOnce(async () => {
      throw new Error("memory graph offline");
    });

    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findText(view.container, "记忆图暂时不可用")).toBeTruthy();
    expect(findText(view.container, "memory graph offline")).toBeTruthy();
    expect(findText(view.container, "还没有记忆节点")).toBeFalsy();
  });

  it("shows a no-match empty state when search removes every visible node", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const searchInput = view.container.querySelector(
      'input[aria-label="Search graph"]',
    ) as HTMLInputElement | null;

    await act(async () => {
      if (!searchInput) {
        throw new Error("search input missing");
      }

      setFormValue(searchInput, "missing node");
    });

    expect(findText(view.container, "还没有记忆节点")).toBeTruthy();
    expect(view.container.querySelector('[data-testid="memory-graph-canvas"]')).toBeFalsy();
    expect(findButton(view.container, "对话")).toBeTruthy();
    expect(view.container.querySelector('input[aria-label="Node title"]')).toBeFalsy();
  });

  it("renders the root empty memory state as a single muted line without the boxed copy", async () => {
    invokeMock
      .mockImplementationOnce(async (command: string) => {
        if (command === "list_memory_scopes") {
          return [
            {
              id: "workflow:workflow-review",
              title: "Release Workflow",
              kind: "workflow",
              workflowId: "workflow-review",
              sessionId: null,
              agentId: null,
            },
          ];
        }

        throw new Error(`unexpected command: ${command}`);
      })
      .mockImplementationOnce(async (command: string) => {
        if (command === "load_memory_graph") {
          return { nodes: [], edges: [] };
        }

        throw new Error(`unexpected command: ${command}`);
      });

    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const emptyState = view.container.querySelector('[data-testid="memory-empty-copy"]');

    expect(emptyState?.textContent?.trim()).toBe("还没有记忆节点");
    expect(findText(view.container, "Memory")).toBeFalsy();
    expect(
      findText(view.container, "The graph will appear here once chat, workflows, or agents write local memory."),
    ).toBeFalsy();
    expect(view.container.querySelector(".memory-empty-state")).toBeFalsy();
  });

  it("recenters the viewport when search changes the visible selection", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const searchInput = view.container.querySelector(
      'input[aria-label="Search graph"]',
    ) as HTMLInputElement | null;

    await act(async () => {
      if (!searchInput) {
        throw new Error("search input missing");
      }

      setFormValue(searchInput, "Review Session");
      await Promise.resolve();
    });

    const canvas = view.container.querySelector('[data-testid="memory-graph-canvas"]');

    expect(canvas?.getAttribute("data-focus-target-id")).toBe("session-sync");
    expect(Number(canvas?.getAttribute("data-zoom") ?? "0")).toBeGreaterThan(1.5);
  });

  it("keeps the selected workflow node centered when search narrows the chosen scope", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const memoryNode = findButton(view.container, "Review Memory");

    await act(async () => {
      memoryNode?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    let canvas = view.container.querySelector('[data-testid="memory-graph-canvas"]');
    expect(canvas?.getAttribute("data-focus-target-id")).toBe("memory-review");
    expect(Math.abs(Number(canvas?.getAttribute("data-pan-x") ?? "0"))).toBeLessThan(24);
    expect(Math.abs(Number(canvas?.getAttribute("data-pan-y") ?? "0"))).toBeLessThan(120);

    const searchInput = view.container.querySelector(
      'input[aria-label="Search graph"]',
    ) as HTMLInputElement | null;

    await act(async () => {
      if (!searchInput) {
        throw new Error("search input missing");
      }

      setFormValue(searchInput, "Review Memory");
      await Promise.resolve();
    });

    canvas = view.container.querySelector('[data-testid="memory-graph-canvas"]');
    expect(canvas?.getAttribute("data-focus-target-id")).toBe("memory-review");
    expect(Number(canvas?.getAttribute("data-zoom") ?? "0")).toBeGreaterThan(1.5);
  });

  it("uses distinct fallback edge ids for different relations when random uuid is unavailable", async () => {
    vi.stubGlobal("crypto", undefined);
    vi.spyOn(Date, "now").mockReturnValue(1_701_000_000_000);

    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const nodeButton = findButton(view.container, "Review Memory");

    await act(async () => {
      nodeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const relationInput = view.container.querySelector('input[aria-label="Edge relation"]') as HTMLInputElement | null;
    const createButton = findButton(view.container, "新建连接");

    await act(async () => {
      if (!relationInput) {
        throw new Error("relation input missing");
      }

      setFormValue(relationInput, "supports");
    });

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      if (!relationInput) {
        throw new Error("relation input missing");
      }

      setFormValue(relationInput, "blocks");
    });

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const createEdgeCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "create_memory_edge",
    );
    const edgeIds = createEdgeCalls.map(([, args]) => String(args?.edgeId ?? ""));

    expect(createEdgeCalls).toHaveLength(2);
    expect(edgeIds[0]).not.toBe(edgeIds[1]);
    expect(edgeIds[0]).toContain("supports");
    expect(edgeIds[1]).toContain("blocks");
  });
});
