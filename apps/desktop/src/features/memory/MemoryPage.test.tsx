import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryPage } from "./MemoryPage";
import { findText, renderIntoDocument } from "@/test/render";

const { invokeMock, resetMocks, scopes, details } = vi.hoisted(() => {
  const scopes: Array<{
    id: string;
    title: string;
    kind: string;
    workflowId: string | null;
    sessionId: string | null;
    agentId: string | null;
  }> = [];
  const details = new Map<
    string,
    {
      id: string;
      title: string;
      kind: string;
      body: string | null;
      relatedIds: string[];
      workflowId: string | null;
      sessionId: string | null;
      agentId: string | null;
    }
  >();

  const invokeMock = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case "list_memory_scopes":
        return scopes;
      case "list_memory_by_workflow": {
        const workflowId = String(args?.workflowId ?? "");
        return scopes.filter((scope) => scope.workflowId === workflowId);
      }
      case "get_memory_node_detail": {
        const nodeId = String(args?.nodeId ?? "");
        return details.get(nodeId) ?? null;
      }
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  });

  const resetMocks = () => {
    scopes.length = 0;
    details.clear();
    invokeMock.mockClear();
  };

  return { invokeMock, resetMocks, scopes, details };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

beforeEach(() => {
  resetMocks();
});

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(text),
  );
}

describe("MemoryPage", () => {
  it("renders an honest empty state when no memory nodes exist", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "No memory nodes yet.")).toBeTruthy();
  });

  it("queries memory by workflow", async () => {
    scopes.push({
      id: "memory-review",
      title: "Review Memory",
      kind: "session",
      workflowId: "workflow-review",
      sessionId: "session-review",
      agentId: "agent-reviewer",
    });

    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    const workflowInput = view.container.querySelector('input[aria-label="Workflow filter"]') as HTMLInputElement | null;
    const loadButton = findButton(view.container, "Load Workflow Memory");

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(workflowInput, "workflow-review");
      workflowInput?.dispatchEvent(new Event("input", { bubbles: true }));
      workflowInput?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      loadButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findText(view.container, "Review Memory")).toBeTruthy();
  });

  it("shows real metadata in the detail inspector", async () => {
    scopes.push({
      id: "memory-review",
      title: "Review Memory",
      kind: "session",
      workflowId: "workflow-review",
      sessionId: "session-review",
      agentId: "agent-reviewer",
    });
    details.set("memory-review", {
      id: "memory-review",
      title: "Review Memory",
      kind: "session",
      body: "Keeps the latest review conclusions.",
      relatedIds: ["workflow-review", "session-review", "agent-reviewer"],
      workflowId: "workflow-review",
      sessionId: "session-review",
      agentId: "agent-reviewer",
    });

    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findText(view.container, "workflow-review")).toBeTruthy();
    expect(findText(view.container, "session-review")).toBeTruthy();
    expect(findText(view.container, "agent-reviewer")).toBeTruthy();
  });
});

