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

const { listWorkspaceSessionsMock, loadWorkspaceSessionMock } = vi.hoisted(() => ({
  listWorkspaceSessionsMock: vi.fn(async () => []),
  loadWorkspaceSessionMock: vi.fn(async () => null),
}));

const { continueTeamRunMock, addTeamRunAgentMock } = vi.hoisted(() => ({
  continueTeamRunMock: vi.fn(async () => {
    throw new Error("unexpected continueTeamRun call");
  }),
  addTeamRunAgentMock: vi.fn(async () => {
    throw new Error("unexpected addTeamRunAgent call");
  }),
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

vi.mock("@/lib/workspace", () => ({
  listWorkspaceSessions: (
    ...args: Parameters<typeof listWorkspaceSessionsMock>
  ) => listWorkspaceSessionsMock(...args),
  loadWorkspaceSession: (
    ...args: Parameters<typeof loadWorkspaceSessionMock>
  ) => loadWorkspaceSessionMock(...args),
}));

vi.mock("@/lib/team", () => ({
  continueTeamRun: (...args: Parameters<typeof continueTeamRunMock>) =>
    continueTeamRunMock(...args),
  addTeamRunAgent: (...args: Parameters<typeof addTeamRunAgentMock>) =>
    addTeamRunAgentMock(...args),
}));

const cleanups: Array<() => Promise<void>> = [];

function getButtonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) =>
      button.textContent?.trim() === text || button.textContent?.includes(text),
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

async function setFieldValue(container: HTMLElement, label: string, value: string) {
  const field = Array.from(container.querySelectorAll("input, textarea")).find(
    (node) => node.getAttribute("aria-label") === label,
  ) as HTMLInputElement | HTMLTextAreaElement | undefined;

  await act(async () => {
    if (!field) {
      throw new Error(`field missing: ${label}`);
    }

    const prototype =
      field instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
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
  listWorkspaceSessionsMock.mockReset();
  loadWorkspaceSessionMock.mockReset();
  continueTeamRunMock.mockReset();
  addTeamRunAgentMock.mockReset();
  listWorkspaceSessionsMock.mockImplementation(async () => []);
  loadWorkspaceSessionMock.mockImplementation(async () => null);
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

  it("renders top tabs for direct chats and team runs and switches the active session", async () => {
    listWorkspaceSessionsMock.mockResolvedValueOnce([
      {
        id: "chat-design-review",
        kind: "direct_chat",
        title: "Design Review Chat",
        status: "active",
        updatedAt: "2026-03-11T12:05:00Z",
      },
      {
        id: "run-release",
        kind: "team_run",
        title: "Release Team Run",
        status: "active",
        updatedAt: "2026-03-11T12:15:00Z",
      },
    ]);

    loadWorkspaceSessionMock.mockImplementation(async (sessionId: string, kind: string) => {
      if (sessionId === "chat-design-review" && kind === "direct_chat") {
        return {
          kind: "direct_chat",
          session: {
            id: "chat-design-review",
            title: "Design Review Chat",
            providerId: "provider-local",
            workflowId: null,
            messageCount: 2,
          },
          messages: [
            {
              id: "message-design-1",
              role: "user",
              content: "Check the design handoff",
            },
          ],
        };
      }

      if (sessionId === "run-release" && kind === "team_run") {
        return {
          kind: "team_run",
          run: {
            id: "run-release",
            teamId: "team-release",
            title: "Release Team Run",
            goal: "Ship the release",
            status: "active",
            currentPhase: "review",
            leadAgentId: "agent-moderator",
            charter: {
              goal: "Ship the release",
              successCriteria: "Release notes and checklist are complete.",
              outputFormat: "Checkpoint summary",
              currentPhase: "review",
              maxRounds: 6,
              maxActiveAgentsPerRound: 2,
              maxMessagesPerAgentPerRound: 2,
              budgetPolicy: "Summaries only",
              stopConditions: ["Checklist complete"],
            },
            createdAt: "2026-03-11T12:10:00Z",
            updatedAt: "2026-03-11T12:15:00Z",
            agents: [],
            events: [],
          },
        };
      }

      return null;
    });

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findText(view.container, "Release Team Run")).toBeTruthy();
    expect(findText(view.container, "Design Review Chat")).toBeTruthy();
    expect(findText(view.container, "Check the design handoff")).toBeTruthy();

    await clickButton(view.container, "Release Team Run");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.container.querySelector('[aria-label="Team run session"]')).toBeTruthy();
    expect(findText(view.container, "Ship the release")).toBeTruthy();
    expect(findText(view.container, "Continue Run")).toBeTruthy();
  });

  it("shows the lead agent, current work, and tool activity for an active team run", async () => {
    listWorkspaceSessionsMock.mockResolvedValueOnce([
      {
        id: "run-release",
        kind: "team_run",
        title: "Release Team Run",
        status: "waiting_for_user",
        updatedAt: "2026-03-11T12:15:00Z",
      },
    ]);

    loadWorkspaceSessionMock.mockImplementation(async (sessionId: string, kind: string) => {
      if (sessionId === "run-release" && kind === "team_run") {
        return {
          kind: "team_run",
          run: {
            id: "run-release",
            teamId: "team-release",
            title: "Release Team Run",
            goal: "Ship the release",
            status: "waiting_for_user",
            currentPhase: "review",
            leadAgentId: "agent-coordinator",
            charter: {
              goal: "Ship the release",
              successCriteria: "Release notes and checklist are complete.",
              outputFormat: "Checkpoint summary",
              currentPhase: "review",
              maxRounds: 6,
              maxActiveAgentsPerRound: 2,
              maxMessagesPerAgentPerRound: 2,
              budgetPolicy: "Summaries only",
              stopConditions: ["Checklist complete"],
            },
            createdAt: "2026-03-11T12:10:00Z",
            updatedAt: "2026-03-11T12:15:00Z",
            agents: [
              {
                id: "agent-coordinator",
                runId: "run-release",
                sourceTeamAgentId: "team-agent-coordinator",
                name: "Coordinator",
                role: "Coordinator",
                responsibility: "Guide the review round.",
                systemPrompt: "Lead the team.",
                toolBindings: [],
                toolUsePolicy: {
                  maxCallsPerRound: 1,
                  summarizeOutput: true,
                },
                status: "reviewing",
                currentWork: "Reviewing evidence conflicts",
                lastToolActivity: null,
                joinedAt: "2026-03-11T12:10:00Z",
              },
              {
                id: "agent-research",
                runId: "run-release",
                sourceTeamAgentId: "team-agent-research",
                name: "Research",
                role: "Research",
                responsibility: "Check evidence gaps.",
                systemPrompt: "Investigate missing evidence.",
                toolBindings: [],
                toolUsePolicy: {
                  maxCallsPerRound: 1,
                  summarizeOutput: true,
                },
                status: "thinking",
                currentWork: "Breaking down the goal",
                lastToolActivity: "Using search_knowledge",
                joinedAt: "2026-03-11T12:10:00Z",
              },
            ],
            events: [
              {
                id: "event-agenda",
                runId: "run-release",
                kind: "round_agenda",
                agentId: "agent-coordinator",
                title: "Coordinator agenda",
                content: "Focus the team on the remaining release blockers.",
                status: "completed",
                toolName: null,
                toolCallId: null,
                toolTarget: null,
                sequence: 1,
                createdAt: "2026-03-11T12:11:00Z",
              },
              {
                id: "event-checkpoint",
                runId: "run-release",
                kind: "checkpoint_summary",
                agentId: "agent-coordinator",
                title: "Checkpoint summary",
                content: "Notes are ready; one blocker remains in release validation.",
                status: "completed",
                toolName: null,
                toolCallId: null,
                toolTarget: null,
                sequence: 2,
                createdAt: "2026-03-11T12:12:00Z",
              },
            ],
          },
        };
      }

      return null;
    });

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findText(view.container, "Coordinator")).toBeTruthy();
    expect(findText(view.container, "Using search_knowledge")).toBeTruthy();
    expect(findText(view.container, "checkpoint_summary")).toBeTruthy();
    expect(findText(view.container, "Add Agent")).toBeTruthy();
  });

  it("continues a run and adds a runtime agent from the team run surface", async () => {
    listWorkspaceSessionsMock.mockResolvedValueOnce([
      {
        id: "run-release",
        kind: "team_run",
        title: "Release Team Run",
        status: "waiting_for_user",
        updatedAt: "2026-03-11T12:15:00Z",
      },
    ]);

    const baseRun = {
      id: "run-release",
      teamId: "team-release",
      title: "Release Team Run",
      goal: "Ship the release",
      status: "waiting_for_user",
      currentPhase: "review",
      leadAgentId: "agent-coordinator",
      charter: {
        goal: "Ship the release",
        successCriteria: "Release notes and checklist are complete.",
        outputFormat: "Checkpoint summary",
        currentPhase: "review",
        maxRounds: 6,
        maxActiveAgentsPerRound: 2,
        maxMessagesPerAgentPerRound: 2,
        budgetPolicy: "Summaries only",
        stopConditions: ["Checklist complete"],
      },
      createdAt: "2026-03-11T12:10:00Z",
      updatedAt: "2026-03-11T12:15:00Z",
      agents: [
        {
          id: "agent-coordinator",
          runId: "run-release",
          sourceTeamAgentId: "team-agent-coordinator",
          name: "Coordinator",
          role: "Coordinator",
          responsibility: "Guide the review round.",
          systemPrompt: "Lead the team.",
          toolBindings: [],
          toolUsePolicy: {
            maxCallsPerRound: 1,
            summarizeOutput: true,
          },
          status: "reviewing",
          currentWork: "Reviewing evidence conflicts",
          lastToolActivity: null,
          joinedAt: "2026-03-11T12:10:00Z",
        },
      ],
      events: [
        {
          id: "event-checkpoint",
          runId: "run-release",
          kind: "checkpoint_summary",
          agentId: "agent-coordinator",
          title: "Checkpoint summary",
          content: "Notes are ready; one blocker remains in release validation.",
          status: "completed",
          toolName: null,
          toolCallId: null,
          toolTarget: null,
          sequence: 1,
          createdAt: "2026-03-11T12:12:00Z",
        },
      ],
    };

    loadWorkspaceSessionMock.mockResolvedValue({
      kind: "team_run",
      run: baseRun,
    });
    continueTeamRunMock.mockResolvedValueOnce({
      ...baseRun,
      status: "active",
      currentPhase: "analysis",
      events: [
        ...baseRun.events,
        {
          id: "event-follow-up",
          runId: "run-release",
          kind: "round_agenda",
          agentId: "agent-coordinator",
          title: "Coordinator agenda",
          content: "Re-check the remaining validation blocker.",
          status: "completed",
          toolName: null,
          toolCallId: null,
          toolTarget: null,
          sequence: 2,
          createdAt: "2026-03-11T12:16:00Z",
        },
      ],
    });
    addTeamRunAgentMock.mockResolvedValueOnce({
      ...baseRun,
      agents: [
        ...baseRun.agents,
        {
          id: "agent-scribe",
          runId: "run-release",
          sourceTeamAgentId: null,
          name: "Scribe",
          role: "Writer",
          responsibility: "Capture the final handoff.",
          systemPrompt: "Write the handoff.",
          toolBindings: [],
          toolUsePolicy: {
            maxCallsPerRound: 1,
            summarizeOutput: true,
          },
          status: "waiting",
          currentWork: "Waiting for coordinator",
          lastToolActivity: null,
          joinedAt: "2026-03-11T12:17:00Z",
        },
      ],
    });

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await setFieldValue(view.container, "Team run follow-up", "Re-check the remaining validation blocker.");
    await clickButton(view.container, "Continue Run");

    expect(continueTeamRunMock).toHaveBeenCalledWith(
      "run-release",
      "Re-check the remaining validation blocker.",
    );
    expect(findText(view.container, "Coordinator agenda")).toBeTruthy();

    await clickButton(view.container, "Add Agent");
    await setFieldValue(view.container, "Agent name", "Scribe");
    await setFieldValue(view.container, "Agent role", "Writer");
    await setFieldValue(view.container, "Agent responsibility", "Capture the final handoff.");
    await clickButton(view.container, "Invite Agent");

    expect(addTeamRunAgentMock).toHaveBeenCalledWith(
      "run-release",
      expect.objectContaining({
        name: "Scribe",
        role: "Writer",
        responsibility: "Capture the final handoff.",
      }),
    );
    expect(findText(view.container, "Scribe")).toBeTruthy();
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
