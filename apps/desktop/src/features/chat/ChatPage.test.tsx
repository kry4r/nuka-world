import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPage } from "./ChatPage";
import type { MemoryCandidate } from "@/lib/memory";
import { findText, renderIntoDocument } from "@/test/render";

type ChatMode =
  | { kind: "chat_only" }
  | { kind: "create_workflow" }
  | { kind: "specific_workflow"; workflowId: string };

function routeForMode(mode: ChatMode) {
  switch (mode.kind) {
    case "create_workflow":
      return { kind: "new_workflow" as const };
    case "specific_workflow":
      return { kind: "existing_workflow" as const, workflowId: mode.workflowId };
    case "chat_only":
    default:
      return { kind: "direct_reply" as const };
  }
}

const routeWorldPromptMock = vi.fn(
  async (
    prompt: string,
    sessionId?: string,
    mode: ChatMode = { kind: "chat_only" },
  ) => {
    if (prompt === "Broken provider") {
      throw new Error("default provider is not configured");
    }

    return {
      session: {
        id: sessionId ?? "session-123",
        title: "Summarize today's notes",
        providerId: "provider-local",
        workflowId: mode.kind === "specific_workflow" ? mode.workflowId : null,
        messageCount: sessionId ? 2 : 1,
      },
      route: routeForMode(mode),
      messages: [
        {
          id: sessionId ? "message-user-2" : "message-user-1",
          role: "user" as const,
          content: prompt,
        },
      ],
      provider: {
        id: "provider-local",
        name: "Local",
        model: "gpt-oss",
        baseUrl: "http://localhost:11434/v1",
      },
      context: {
        attachedAgents: [],
        attachedKnowledgeLibraries: [],
      },
    };
  },
);

const { providerGateState } = vi.hoisted(() => ({
  providerGateState: {
    ready: true,
    blocked: false,
    message: "Provider ready",
    openSettings: vi.fn(),
  },
}));

const { listPendingMemoryCandidatesMock, reviewMemoryCandidateMock } = vi.hoisted(() => ({
  listPendingMemoryCandidatesMock: vi.fn(async (): Promise<MemoryCandidate[]> => []),
  reviewMemoryCandidateMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/chat", () => ({
  routeWorldPrompt: (...args: Parameters<typeof routeWorldPromptMock>) =>
    routeWorldPromptMock(...args),
}));

vi.mock("@/hooks/useProviderGate", () => ({
  useProviderGate: () => providerGateState,
}));

vi.mock("@/lib/memory", () => ({
  listPendingMemoryCandidates: (
    ...args: Parameters<typeof listPendingMemoryCandidatesMock>
  ) => listPendingMemoryCandidatesMock(...args),
  reviewMemoryCandidate: (
    ...args: Parameters<typeof reviewMemoryCandidateMock>
  ) => reviewMemoryCandidateMock(...args),
}));

const cleanups: Array<() => Promise<void>> = [];

function getButtonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text,
  );
}

async function clickButton(container: HTMLElement, text: string) {
  await act(async () => {
    getButtonByText(container, text)?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function setComposerValue(container: HTMLElement, value: string) {
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;

  await act(async () => {
    if (!textarea) {
      throw new Error("textarea missing");
    }

    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
}

async function clickWorkflowOption(container: HTMLElement, workflowId: string) {
  const option = container.querySelector(`[data-workflow-id="${workflowId}"]`) as
    | HTMLButtonElement
    | null;

  await act(async () => {
    if (!option) {
      throw new Error("workflow option missing");
    }

    option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

function deferredValue<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

afterEach(async () => {
  routeWorldPromptMock.mockReset();
  listPendingMemoryCandidatesMock.mockReset();
  reviewMemoryCandidateMock.mockReset();
  providerGateState.ready = true;
  providerGateState.blocked = false;
  providerGateState.message = "Provider ready";
  providerGateState.openSettings.mockReset();

  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

describe("ChatPage", () => {
  it("renders only the logo hero and composer on first load", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    expect(view.container.querySelector('[data-testid="chat-landing-stack"]')).toBeTruthy();
    expect(view.container.querySelector('[aria-label="World chat landing hero"]')).toBeTruthy();
    expect(view.container.querySelector("textarea")).toBeTruthy();
    expect(view.container.querySelector(".composer__add")).toBeTruthy();
    expect(view.container.querySelector(".composer__icon--plus")).toBeTruthy();
    expect(view.container.querySelector(".composer__icon--send")).toBeTruthy();
    expect(view.container.querySelector('[aria-label="Chat mode"]')).toBeFalsy();
    expect(view.container.querySelector('[aria-label="Composer entry modes"]')).toBeFalsy();
    expect(findText(view.container, "Direct chat")).toBeFalsy();
    expect(findText(view.container, "Provider required")).toBeFalsy();
    expect(findText(view.container, "Context Inspector")).toBeFalsy();
  });

  it("reveals composer entry modes from the plus menu", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "+");

    expect(view.container.querySelector('[aria-label="Composer entry modes"]')).toBeTruthy();
    expect(findText(view.container, "Direct chat")).toBeTruthy();
    expect(findText(view.container, "Choose workflow")).toBeTruthy();
    expect(findText(view.container, "Create workflow")).toBeTruthy();
  });

  it("shows a compact workflow pill beside the plus button with a clear action and picker menu", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    expect(view.container.querySelector('[data-testid="chat-workflow-chooser"]')).toBeFalsy();
    expect(findText(view.container, "Saved workflow")).toBeFalsy();

    await clickButton(view.container, "+");
    await clickButton(view.container, "Choose workflow");

    const chooser = view.container.querySelector('[data-testid="chat-workflow-chooser"]');
    const composerMenu = view.container.querySelector(".composer__menu");
    const composerInput = view.container.querySelector("textarea");

    expect(chooser).toBeTruthy();
    expect(composerMenu?.nextElementSibling).toBe(chooser);
    expect(view.container.querySelector('[aria-label="Composer entry modes"]')).toBeFalsy();
    expect(view.container.querySelector('[data-testid="chat-workflow-options"]')).toBeTruthy();
    expect(view.container.querySelector('button[aria-label="Clear workflow chooser"]')).toBeTruthy();
    expect(composerInput?.getAttribute("placeholder")).toBe("");
    expect(findText(view.container, "Saved workflow")).toBeFalsy();
  });

  it("shows a compact create-workflow pill beside the plus button without opening workflow options", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "+");
    await clickButton(view.container, "Create workflow");

    const createPill = view.container.querySelector('[data-testid="chat-create-pill"]');
    const composerMenu = view.container.querySelector(".composer__menu");
    const composerInput = view.container.querySelector("textarea");

    expect(createPill).toBeTruthy();
    expect(composerMenu?.nextElementSibling).toBe(createPill);
    expect(view.container.querySelector('[data-testid="chat-workflow-options"]')).toBeFalsy();
    expect(view.container.querySelector('button[aria-label="Clear create workflow"]')).toBeTruthy();
    expect(composerInput?.getAttribute("placeholder")).toContain("Describe the workflow");
  });

  it("removes provider feedback inline from the composer", async () => {
    providerGateState.ready = false;
    providerGateState.blocked = true;
    providerGateState.message = "Provider required";

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    expect(view.container.querySelector("textarea")).toBeTruthy();
    expect(view.container.querySelector('[data-testid="chat-provider-inline"]')).toBeFalsy();
    expect(findText(view.container, "Provider required")).toBeFalsy();
    expect(findText(view.container, "Open Settings")).toBeFalsy();
    expect(findText(view.container, "Context Inspector")).toBeFalsy();
  });

  it("switches into conversation state after a direct send without rendering an inspector", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await setComposerValue(view.container, "Summarize today's notes");
    await clickButton(view.container, "Send");

    expect(routeWorldPromptMock).toHaveBeenCalledWith(
      "Summarize today's notes",
      undefined,
      { kind: "chat_only" },
    );
    expect(view.container.querySelector('[aria-label="World conversation surface"]')).toBeTruthy();
    expect(findText(view.container, "Context Inspector")).toBeFalsy();
    expect(findText(view.container, "Summarize today's notes")).toBeTruthy();
    expect(view.container.querySelector('[aria-label="Suggested next steps"]')).toBeTruthy();
  });

  it("requires a saved workflow selection before sending in choose workflow mode", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "+");
    await clickButton(view.container, "Choose workflow");
    await setComposerValue(view.container, "Review the release checklist");
    await clickButton(view.container, "Send");

    expect(routeWorldPromptMock).not.toHaveBeenCalled();
    expect(findText(view.container, "Select a workflow before sending.")).toBeTruthy();
  });

  it("routes a selected workflow from the plus menu and shows a lightweight token", async () => {
    const onWorkflowHandoff = vi.fn();
    const view = await renderIntoDocument(<ChatPage onWorkflowHandoff={onWorkflowHandoff} />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "+");
    await clickButton(view.container, "Choose workflow");
    await clickWorkflowOption(view.container, "workflow-release-notes");
    await setComposerValue(view.container, "Review the release checklist");
    await clickButton(view.container, "Send");

    expect(routeWorldPromptMock).toHaveBeenCalledWith(
      "Review the release checklist",
      undefined,
      { kind: "specific_workflow", workflowId: "workflow-release-notes" },
    );
    expect(onWorkflowHandoff).toHaveBeenCalledWith({
      kind: "open_workflow_room",
      workflowId: "workflow-release-notes",
      prompt: "Review the release checklist",
      origin: {
        sourceMode: "specific_workflow",
        sourceSessionId: "session-123",
      },
    });
    expect(view.container.querySelector('[data-testid="chat-workflow-token"]')).toBeTruthy();
    expect(findText(view.container, "Release Notes")).toBeTruthy();
    expect(findText(view.container, "Open Workflow")).toBeTruthy();
  });

  it("can switch an active direct chat session into a selected workflow route", async () => {
    const onWorkflowHandoff = vi.fn();
    const view = await renderIntoDocument(<ChatPage onWorkflowHandoff={onWorkflowHandoff} />);
    cleanups.push(view.cleanup);

    await setComposerValue(view.container, "Start with a direct chat");
    await clickButton(view.container, "Send");

    await clickButton(view.container, "+");
    await clickButton(view.container, "Choose workflow");
    await clickWorkflowOption(view.container, "workflow-release-notes");
    await setComposerValue(view.container, "Continue in the release workflow");
    await clickButton(view.container, "Send");

    expect(routeWorldPromptMock).toHaveBeenLastCalledWith(
      "Continue in the release workflow",
      "session-123",
      { kind: "specific_workflow", workflowId: "workflow-release-notes" },
    );
    expect(onWorkflowHandoff).toHaveBeenLastCalledWith({
      kind: "open_workflow_room",
      workflowId: "workflow-release-notes",
      prompt: "Continue in the release workflow",
      origin: {
        sourceMode: "specific_workflow",
        sourceSessionId: "session-123",
      },
    });
    expect(view.container.querySelector('[data-testid="chat-workflow-token"]')).toBeTruthy();
  });

  it("surfaces a create-workflow handoff inline after routing", async () => {
    const onWorkflowHandoff = vi.fn();
    const view = await renderIntoDocument(<ChatPage onWorkflowHandoff={onWorkflowHandoff} />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "+");
    await clickButton(view.container, "Create workflow");
    await setComposerValue(view.container, "Draft a release process");
    await clickButton(view.container, "Send");

    expect(routeWorldPromptMock).toHaveBeenCalledWith(
      "Draft a release process",
      undefined,
      { kind: "create_workflow" },
    );
    expect(findText(view.container, "Workflow draft ready")).toBeTruthy();

    await clickButton(view.container, "Open Workflow");

    expect(onWorkflowHandoff).toHaveBeenCalledWith({
      kind: "open_workflow_lobby",
      prompt: "Draft a release process",
      origin: {
        sourceMode: "create_workflow",
        sourceSessionId: "session-123",
      },
    });
  });

  it("renders the memory review as an inline chat card once a real session is active", async () => {
    listPendingMemoryCandidatesMock.mockResolvedValueOnce([
      {
        id: "candidate-chat-1",
        nodeId: "node-chat-1",
        title: "Release Checklist Memory",
        surface: "chat",
        ownerId: "session-123",
        suggestedSchemaId: "schema-release",
        confidence: 0.82,
        reason: "Repeated release guidance",
        evidenceCount: 2,
      },
    ]);

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await setComposerValue(view.container, "Summarize today's notes");
    await clickButton(view.container, "Send");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(listPendingMemoryCandidatesMock).toHaveBeenCalledWith("chat", "session-123");
    expect(view.container.querySelector('[data-testid="memory-review-toggle"]')).toBeFalsy();
    expect(view.container.querySelector('[data-testid="memory-review-panel"]')).toBeFalsy();
    expect(view.container.querySelector('[data-testid="memory-review-inline"]')).toBeTruthy();
    expect(
      view.container.querySelector(".chat-feed__stack")?.contains(
        view.container.querySelector('[data-testid="memory-review-inline"]') ?? null,
      ),
    ).toBe(true);
    expect(view.container.textContent).toContain("转入长期语义记忆");
    expect(view.container.textContent).toContain("暂留为情景记忆");
    expect(view.container.textContent).toContain("拒绝");
  });

  it("prevents overlapping sends while routing is active", async () => {
    const firstResponse = {
      session: {
        id: "session-123",
        title: "Summarize today's notes",
        providerId: "provider-local",
        workflowId: null,
        messageCount: 1,
      },
      route: { kind: "direct_reply" as const },
      messages: [
        {
          id: "message-user-1",
          role: "user" as const,
          content: "Start a release review",
        },
      ],
      provider: {
        id: "provider-local",
        name: "Local",
        model: "gpt-oss",
        baseUrl: "http://localhost:11434/v1",
      },
      context: {
        attachedAgents: [],
        attachedKnowledgeLibraries: [],
      },
    };
    const pendingSend = deferredValue<typeof firstResponse>();

    routeWorldPromptMock.mockResolvedValueOnce(firstResponse);
    routeWorldPromptMock.mockImplementationOnce(() => pendingSend.promise);

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await setComposerValue(view.container, "Start a release review");
    await clickButton(view.container, "Send");
    await setComposerValue(view.container, "Second turn");
    await clickButton(view.container, "Send");

    const suggestionButton = getButtonByText(view.container, "Plan my next workflow");
    expect(suggestionButton?.hasAttribute("disabled")).toBe(true);

    expect(routeWorldPromptMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      pendingSend.resolve({
        ...firstResponse,
        session: {
          ...firstResponse.session,
          messageCount: 2,
        },
        messages: [
          {
            id: "message-user-2",
            role: "user" as const,
            content: "Second turn",
          },
        ],
      });
      await pendingSend.promise;
    });
  });
});
