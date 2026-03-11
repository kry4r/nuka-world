import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryPage } from "./MemoryPage";
import { findText, renderIntoDocument } from "@/test/render";

const { invokeMock, resetMocks, graphState } = vi.hoisted(() => {
  const initialNodes: Array<{
    body: string | null;
    consolidationState: string;
    id: string;
    kind: string;
    traceType: string;
    title: string;
  }> = [
      {
        id: "workflow-review",
        kind: "workflow",
        title: "Release Workflow",
        body: "Coordinates release validation.",
        traceType: "semantic",
        consolidationState: "approved",
      },
      {
        id: "fact-archive",
        kind: "fact",
        title: "Archive Fact",
        body: "Older note kept for comparison.",
        traceType: "semantic",
        consolidationState: "archived",
      },
      {
        id: "memory-review",
        kind: "fact",
        title: "Review Memory",
        body: "Tracks the latest review conclusions.",
        traceType: "episodic",
        consolidationState: "candidate",
      },
      {
        id: "session-sync",
        kind: "session",
        title: "Review Session",
        body: "Tracks the active review conversation.",
        traceType: "working",
        consolidationState: "none",
      },
      {
        id: "agent-scout",
        kind: "agent",
        title: "Scout Agent",
        body: "Flags follow-up work.",
        traceType: "semantic",
        consolidationState: "rejected",
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

  const invokeMock = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case "load_memory_graph":
        return structuredClone(graphState);
      case "list_memory_scopes":
        return graphState.nodes.map((node) => ({
          id: node.id,
          title: node.title,
          kind: node.kind,
          workflowId: node.kind === "workflow" ? node.id : null,
          sessionId: null,
          agentId: null,
        }));
      case "list_memory_by_workflow": {
        const workflowId = String(args?.workflowId ?? "");
        return graphState.nodes
          .filter((node) => node.id === workflowId || node.kind !== "workflow")
          .map((node) => ({
            id: node.id,
            title: node.title,
            kind: node.kind,
            workflowId: workflowId || null,
            sessionId: null,
            agentId: null,
          }));
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

    expect(findText(view.container, "Activation")).toBeTruthy();
    expect(findText(view.container, "Consolidation")).toBeTruthy();
    expect(findText(view.container, "Schema")).toBeTruthy();
    expect(canvas?.getAttribute("data-workbench-view")).toBe("activation");

    await act(async () => {
      findButton(view.container, "Consolidation")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(canvas?.getAttribute("data-workbench-view")).toBe("consolidation");

    await act(async () => {
      findButton(view.container, "Schema")?.dispatchEvent(
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

  it("uses a light graph surface and overlays graph stats inside the canvas", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const canvas = view.container.querySelector('[data-testid="memory-graph-canvas"]');
    const selectedNode = findButton(view.container, "Review Memory");

    expect(canvas?.className).toContain("memory-graph");
    expect(selectedNode?.className).toContain("memory-graph__node");
    expect(view.container.querySelector(".memory-controls__summary")).toBeFalsy();
    expect(canvas?.textContent).toContain("nodes");
    expect(canvas?.textContent).toContain("edges");
    expect(canvas?.textContent).toContain("% zoom");
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
    expect(view.container.textContent).not.toContain("Node Inspector");
    expect(view.container.querySelector('[data-testid="memory-node-detail"]')).toBeFalsy();
    expect(view.container.querySelector('input[aria-label="Search graph"]')).toBeTruthy();
    expect(view.container.querySelector('select[aria-label="Filter kind"]')).toBeTruthy();
    expect(view.container.querySelector('select[aria-label="View mode"]')).toBeTruthy();

    await act(async () => {
      nodeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const detail = view.container.querySelector('[data-testid="memory-node-detail"]');

    expect(detail?.className).toContain("memory-node-overlay");
    expect(canvasFrame?.contains(detail ?? null)).toBe(true);
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

    expect(findText(view.container, "Trace type")).toBeTruthy();
    expect(findText(view.container, "episodic")).toBeTruthy();
    expect(findText(view.container, "Consolidation state")).toBeTruthy();
    expect(findText(view.container, "candidate")).toBeTruthy();
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

    const deleteButton = findButton(view.container, "Delete node");

    await act(async () => {
      deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(findText(view.container, "Delete impact")).toBeTruthy();
    expect(findText(view.container, "2 connected links will be removed.")).toBeTruthy();
    expect(findText(view.container, "Release Workflow")).toBeTruthy();
    expect(findText(view.container, "Review Session")).toBeTruthy();
    expect(invokeMock).not.toHaveBeenCalledWith("delete_memory_node", expect.anything());

    const confirmDelete = findButton(view.container, "Confirm delete");

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

    expect(findText(view.container, "Memory graph unavailable")).toBeTruthy();
    expect(findText(view.container, "memory graph offline")).toBeTruthy();
    expect(findText(view.container, "No graph nodes yet")).toBeFalsy();
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

    expect(findText(view.container, "No graph nodes yet")).toBeTruthy();
    expect(findButton(view.container, "Release Workflow")).toBeFalsy();
    expect(view.container.querySelector('input[aria-label="Node title"]')).toBeFalsy();
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
    expect(canvas?.getAttribute("data-pan-x")).toBe("130");
    expect(canvas?.getAttribute("data-pan-y")).toBe("168");
  });

  it("recenters when the selected node keeps the same id but moves to a new layout row", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const viewModeSelect = view.container.querySelector(
      'select[aria-label="View mode"]',
    ) as HTMLSelectElement | null;

    await act(async () => {
      if (!viewModeSelect) {
        throw new Error("view mode select missing");
      }

      setFormValue(viewModeSelect, "full");
    });

    const memoryNode = findButton(view.container, "Review Memory");

    await act(async () => {
      memoryNode?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    let canvas = view.container.querySelector('[data-testid="memory-graph-canvas"]');
    expect(canvas?.getAttribute("data-focus-target-id")).toBe("memory-review");
    expect(canvas?.getAttribute("data-pan-x")).toBe("-434");
    expect(canvas?.getAttribute("data-pan-y")).toBe("20");

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
    expect(canvas?.getAttribute("data-pan-x")).toBe("-434");
    expect(canvas?.getAttribute("data-pan-y")).toBe("168");
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
    const createButton = findButton(view.container, "Create link");

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
