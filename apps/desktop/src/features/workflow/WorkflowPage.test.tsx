import { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowPage } from "./WorkflowPage";
import type { MemoryCandidate } from "@/lib/memory";
import { findText, renderIntoDocument } from "@/test/render";

const { startWorkflowSessionMock, continueWorkflowSessionMock } = vi.hoisted(() => ({
  startWorkflowSessionMock: vi.fn(
    async (
      workflowId: string,
      inputs?: Record<string, string>,
      origin?: { sourceSessionId: string; sourceMode: "create_workflow" | "specific_workflow" },
    ) => ({
      sessionId: "workflow-session-1",
      workflowId,
      inputs: inputs ?? {},
      status: "active",
      origin: origin ?? null,
      events: [
        {
          kind: "user_message" as const,
          id: "event-user-1",
          content: "Prepare a product launch brief",
        },
        {
          kind: "assistant_message" as const,
          id: "event-assistant-1",
          content: "I opened the room, captured the brief, and queued the first pass.",
        },
        {
          kind: "node_event" as const,
          id: "event-node-1",
          title: "Scope intake",
          status: "completed",
          detail: "The workflow collected the goal and assigned the drafting lane.",
        },
      ],
    }),
  ),
  continueWorkflowSessionMock: vi.fn(async (sessionId: string, prompt: string) => ({
    sessionId,
    workflowId: "workflow-research-brief",
    inputs: {
      goal: "Prepare a product launch brief",
    },
    status: "active",
    events: [
      {
        kind: "user_message" as const,
        id: "event-user-1",
        content: "Prepare a product launch brief",
      },
      {
        kind: "assistant_message" as const,
        id: "event-assistant-1",
        content: "I opened the room, captured the brief, and queued the first pass.",
      },
      {
        kind: "node_event" as const,
        id: "event-node-1",
        title: "Scope intake",
        status: "completed",
        detail: "The workflow collected the goal and assigned the drafting lane.",
      },
      {
        kind: "user_message" as const,
        id: "event-user-2",
        content: prompt,
      },
      {
        kind: "assistant_message" as const,
        id: "event-assistant-2",
        content: "I expanded the room with the requested follow-up direction.",
      },
      {
        kind: "node_event" as const,
        id: "event-node-2",
        title: "Draft follow-up",
        status: "running",
        detail: "The workflow is extending the launch brief with the new instruction.",
      },
    ],
  })),
}));

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

vi.mock("@/lib/workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflow")>();

  return {
    ...actual,
    startWorkflowSession: (...args: Parameters<typeof startWorkflowSessionMock>) => startWorkflowSessionMock(...args),
    continueWorkflowSession: (...args: Parameters<typeof continueWorkflowSessionMock>) =>
      continueWorkflowSessionMock(...args),
  };
});

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

afterEach(async () => {
  startWorkflowSessionMock.mockClear();
  continueWorkflowSessionMock.mockClear();
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

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(text),
  );
}

function setFormValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("WorkflowPage", () => {
  it("blocks workflow start until provider ready", async () => {
    providerGateState.ready = false;
    providerGateState.blocked = true;
    providerGateState.message = "Provider required";

    const view = await renderIntoDocument(<WorkflowPage />);
    cleanups.push(view.cleanup);

    const startButton = findButton(view.container, "Start Workflow");

    expect(startButton?.hasAttribute("disabled")).toBe(true);
    expect(view.container.textContent).toContain("Provider required");
    expect(view.container.textContent).toContain("Open Settings");
  });

  it("keeps workflow room header source free of mojibake separators", () => {
    const source = readFileSync(resolve(process.cwd(), "src/features/workflow/WorkflowRoom.tsx"), "utf8");
    const headerLine = source
      .split("\n")
      .find((line) => line.includes("description={`${workflowTitle}"));

    expect(headerLine).toContain(" | Session ");
    expect(/[^\x00-\x7F]/.test(headerLine ?? "")).toBe(false);
  });

  it("renders a workflow lobby before any session starts", async () => {
    const view = await renderIntoDocument(<WorkflowPage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Workflow Lobby")).toBeTruthy();
    expect(findText(view.container, "Workflow Room")).toBeFalsy();
    expect(findText(view.container, "Research Brief")).toBeTruthy();
    expect(findText(view.container, "Choose a saved workflow and open a dedicated room for the session.")).toBeTruthy();
  });

  it("opens a workflow room after starting a workflow", async () => {
    const view = await renderIntoDocument(<WorkflowPage />);
    cleanups.push(view.cleanup);

    const goalInput = view.container.querySelector('input[placeholder="What should this workflow produce?"]') as HTMLInputElement | null;
    const startButton = findButton(view.container, "Start Workflow");

    await act(async () => {
      if (!goalInput) {
        throw new Error("goal input missing");
      }

      setFormValue(goalInput, "Prepare a product launch brief");
    });

    await act(async () => {
      startButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startWorkflowSessionMock).toHaveBeenCalledWith(
      "workflow-research-brief",
      {
        goal: "Prepare a product launch brief",
      },
      undefined,
    );
    expect(findText(view.container, "Workflow Room")).toBeTruthy();
    expect(findText(view.container, "Research Brief | Session workflow...")).toBeTruthy();
    expect(findText(view.container, "Workflow Lobby")).toBeFalsy();
    expect(findText(view.container, "Status: active")).toBeTruthy();
  });

  it("renders the three-way memory review dock in the workflow room", async () => {
    listPendingMemoryCandidatesMock.mockResolvedValueOnce([
      {
        id: "candidate-workflow-1",
        nodeId: "node-workflow-1",
        title: "Launch Brief Memory",
        surface: "workflow",
        ownerId: "workflow-session-1",
        suggestedSchemaId: "schema-launch",
        confidence: 0.77,
        reason: "Repeated launch-planning cue",
        evidenceCount: 3,
      },
    ]);

    const view = await renderIntoDocument(<WorkflowPage />);
    cleanups.push(view.cleanup);

    const startButton = findButton(view.container, "Start Workflow");
    await act(async () => {
      startButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(listPendingMemoryCandidatesMock).toHaveBeenCalledWith(
      "workflow",
      "workflow-session-1",
    );
    expect(view.container.textContent).toContain("转入长期语义记忆");
    expect(view.container.textContent).toContain("暂留为情景记忆");
    expect(view.container.textContent).toContain("拒绝");
  });

  it("refreshes the memory review dock after another turn in the same workflow room", async () => {
    listPendingMemoryCandidatesMock
      .mockResolvedValueOnce([
        {
          id: "candidate-workflow-1",
          nodeId: "node-workflow-1",
          title: "First Workflow Candidate",
          surface: "workflow",
          ownerId: "workflow-session-1",
          suggestedSchemaId: null,
          confidence: 0.74,
          reason: "First workflow cue",
          evidenceCount: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "candidate-workflow-2",
          nodeId: "node-workflow-2",
          title: "Second Workflow Candidate",
          surface: "workflow",
          ownerId: "workflow-session-1",
          suggestedSchemaId: null,
          confidence: 0.81,
          reason: "Second workflow cue",
          evidenceCount: 2,
        },
      ]);

    const view = await renderIntoDocument(<WorkflowPage />);
    cleanups.push(view.cleanup);

    const startButton = findButton(view.container, "Start Workflow");
    await act(async () => {
      startButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const composer = view.container.querySelector(
      'textarea[placeholder="Message this workflow room..."]',
    ) as HTMLTextAreaElement | null;
    const continueButton = findButton(view.container, "Continue Workflow");
    await act(async () => {
      if (!composer) {
        throw new Error("workflow composer missing");
      }

      setFormValue(composer, "Second workflow turn");
    });
    await act(async () => {
      continueButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(listPendingMemoryCandidatesMock).toHaveBeenNthCalledWith(
      1,
      "workflow",
      "workflow-session-1",
    );
    expect(listPendingMemoryCandidatesMock).toHaveBeenNthCalledWith(
      2,
      "workflow",
      "workflow-session-1",
    );
    expect(view.container.textContent).toContain("Second Workflow Candidate");
  });

  it("renders transcript and timeline events inside the workflow room", async () => {
    const view = await renderIntoDocument(<WorkflowPage />);
    cleanups.push(view.cleanup);

    const startButton = findButton(view.container, "Start Workflow");

    await act(async () => {
      startButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findText(view.container, "Transcript")).toBeTruthy();
    expect(findText(view.container, "Timeline")).toBeTruthy();
    expect(findText(view.container, "Prepare a product launch brief")).toBeTruthy();
    expect(findText(view.container, "I opened the room, captured the brief, and queued the first pass.")).toBeTruthy();
    expect(findText(view.container, "Scope intake")).toBeTruthy();
    expect(findText(view.container, "The workflow collected the goal and assigned the drafting lane.")).toBeTruthy();
  });

  it("accepts a follow-up message after the workflow session starts", async () => {
    const view = await renderIntoDocument(<WorkflowPage />);
    cleanups.push(view.cleanup);

    const startButton = findButton(view.container, "Start Workflow");

    await act(async () => {
      startButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const composer = view.container.querySelector('textarea[placeholder="Message this workflow room..."]') as HTMLTextAreaElement | null;
    const continueButton = findButton(view.container, "Continue Workflow");

    expect(composer?.hasAttribute("disabled")).toBe(false);

    await act(async () => {
      if (!composer) {
        throw new Error("workflow composer missing");
      }

      setFormValue(composer, "Turn this into an executive launch outline");
    });

    await act(async () => {
      continueButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(continueWorkflowSessionMock).toHaveBeenCalledWith(
      "workflow-session-1",
      "Turn this into an executive launch outline",
    );
    expect(findText(view.container, "I expanded the room with the requested follow-up direction.")).toBeTruthy();
    expect(findText(view.container, "Draft follow-up")).toBeTruthy();
  });

  it("forwards chat handoff origin when opening a specific workflow room from app intent", async () => {
    const view = await renderIntoDocument(
      <WorkflowPage
        intent={{
          kind: "open_workflow_room",
          workflowId: "workflow-release-notes",
          prompt: "Review the release checklist",
          origin: {
            sourceSessionId: "chat-session-specific",
            sourceMode: "specific_workflow",
          },
        }}
      />,
    );
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startWorkflowSessionMock).toHaveBeenCalledWith(
      "workflow-release-notes",
      { releaseScope: "Review the release checklist" },
      {
        sourceSessionId: "chat-session-specific",
        sourceMode: "specific_workflow",
      },
    );
    expect(findText(view.container, "Workflow Room")).toBeTruthy();
  });
});
