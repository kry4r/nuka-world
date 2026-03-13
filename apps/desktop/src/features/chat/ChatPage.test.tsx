import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPage } from "./ChatPage";
import type { MemoryCandidate } from "@/lib/memory";
import type {
  RuntimeAgentInput,
  TeamRecord,
  TeamRunRecord,
} from "@/lib/team";
import type {
  WorkspaceSessionDetail,
  WorkspaceSessionSummary,
} from "@/lib/workspace";
import { findText, renderIntoDocument } from "@/test/render";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async (command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case "open_external_prompt_draft":
        return `${String(args?.initialContent ?? "")}\nExpanded draft from editor`;
      default:
        throw new Error(`unexpected tauri command: ${command}`);
    }
  }),
}));

const sampleTeam: TeamRecord = {
  id: "team-release",
  name: "Release Team",
  goal: "Ship the release and publish notes",
  summary: "Coordinates release validation, notes, and final publish readiness.",
  promptConstraints: "Stay concise and keep the release evidence auditable.",
  permissionPolicy: "No destructive tools without explicit approval.",
  successCriteria: "Release notes and checklist are complete.",
  coordinationPolicy: "Moderator-led rounds with checkpoint summaries.",
  createdAt: "2026-03-11T12:00:00Z",
  updatedAt: "2026-03-11T12:00:00Z",
  status: "ready",
  agents: [
    {
      id: "team-agent-moderator",
      teamId: "team-release",
      name: "Moderator",
      role: "Moderator",
      responsibility: "Keep the team focused and synthesize checkpoints.",
      systemPrompt: "Run moderated planning rounds.",
      toolBindings: [],
      toolUsePolicy: {
        maxCallsPerRound: 1,
        summarizeOutput: true,
      },
      orderHint: 0,
      createdAt: "2026-03-11T12:00:00Z",
      updatedAt: "2026-03-11T12:00:00Z",
    },
  ],
  agentAssignments: [
    {
      id: "assignment-moderator",
      teamId: "team-release",
      agentId: "agent-moderator",
      enabled: true,
      orderHint: 0,
      promptOverride: null,
      permissionOverrideJson: "{}",
      createdAt: "2026-03-11T12:00:00Z",
      updatedAt: "2026-03-11T12:00:00Z",
    },
  ],
};

const sampleRun: TeamRunRecord = {
  id: "run-release",
  teamId: "team-release",
  title: "Release Team Run",
  goal: "Ship the release and publish notes",
  status: "active",
  currentPhase: "kickoff",
  leadAgentId: "agent-coordinator",
  charter: {
    goal: "Ship the release and publish notes",
    successCriteria: "Release notes and checklist are complete.",
    outputFormat: "Checkpoint summary",
    currentPhase: "kickoff",
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
      sourceAgentId: "agent-moderator",
      sourceTeamAssignmentId: "assignment-moderator",
      sourceTeamAgentId: "team-agent-moderator",
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

const routeWorldPromptMock = vi.fn(
  async (prompt: string, sessionId?: string) => {
    if (prompt === "Broken provider") {
      throw new Error("default provider is not configured");
    }

    return {
      session: {
        id: sessionId ?? "session-123",
        title: "Summarize today's notes",
        providerId: "provider-local",
        messageCount: sessionId ? 2 : 1,
      },
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
  listWorkspaceSessionsMock: vi.fn<() => Promise<WorkspaceSessionSummary[]>>(
    async () => [],
  ),
  loadWorkspaceSessionMock: vi.fn<
    (
      sessionId: string,
      kind: WorkspaceSessionSummary["kind"],
    ) => Promise<WorkspaceSessionDetail | null>
  >(async () => null),
}));

const {
  listTeamsMock,
  createTeamFromGoalMock,
  startTeamRunMock,
  continueTeamRunMock,
  addTeamRunAgentMock,
} = vi.hoisted(() => ({
  listTeamsMock: vi.fn<() => Promise<TeamRecord[]>>(async () => [sampleTeam]),
  createTeamFromGoalMock: vi.fn<(goal: string) => Promise<TeamRecord>>(
    async (goal: string) => ({
      ...sampleTeam,
      goal,
    }),
  ),
  startTeamRunMock: vi.fn<(teamId: string) => Promise<TeamRunRecord>>(
    async () => sampleRun,
  ),
  continueTeamRunMock: vi.fn<(runId: string, prompt: string) => Promise<TeamRunRecord>>(
    async () => {
      throw new Error("unexpected continueTeamRun call");
    },
  ),
  addTeamRunAgentMock: vi.fn<
    (runId: string, agentSpec: RuntimeAgentInput) => Promise<TeamRunRecord>
  >(async () => {
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
  listTeams: (...args: Parameters<typeof listTeamsMock>) => listTeamsMock(...args),
  createTeamFromGoal: (...args: Parameters<typeof createTeamFromGoalMock>) =>
    createTeamFromGoalMock(...args),
  startTeamRun: (...args: Parameters<typeof startTeamRunMock>) =>
    startTeamRunMock(...args),
  continueTeamRun: (...args: Parameters<typeof continueTeamRunMock>) =>
    continueTeamRunMock(...args),
  addTeamRunAgent: (...args: Parameters<typeof addTeamRunAgentMock>) =>
    addTeamRunAgentMock(...args),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
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

async function clickTeamOption(container: HTMLElement, teamId: string) {
  const option = container.querySelector(`[data-team-id="${teamId}"]`) as
    | HTMLButtonElement
    | null;

  await act(async () => {
    if (!option) {
      throw new Error("team option missing");
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
  invokeMock.mockClear();
  invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case "open_external_prompt_draft":
        return `${String(args?.initialContent ?? "")}\nExpanded draft from editor`;
      default:
        throw new Error(`unexpected tauri command: ${command}`);
    }
  });
  routeWorldPromptMock.mockReset();
  routeWorldPromptMock.mockImplementation(async (prompt: string, sessionId?: string) => {
    if (prompt === "Broken provider") {
      throw new Error("default provider is not configured");
    }

    return {
      session: {
        id: sessionId ?? "session-123",
        title: "Summarize today's notes",
        providerId: "provider-local",
        messageCount: sessionId ? 2 : 1,
      },
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
  });
  listPendingMemoryCandidatesMock.mockReset();
  reviewMemoryCandidateMock.mockReset();
  listWorkspaceSessionsMock.mockReset();
  loadWorkspaceSessionMock.mockReset();
  listTeamsMock.mockReset();
  createTeamFromGoalMock.mockReset();
  startTeamRunMock.mockReset();
  continueTeamRunMock.mockReset();
  addTeamRunAgentMock.mockReset();

  listPendingMemoryCandidatesMock.mockImplementation(async () => []);
  reviewMemoryCandidateMock.mockImplementation(async () => undefined);
  listWorkspaceSessionsMock.mockImplementation(async () => []);
  loadWorkspaceSessionMock.mockImplementation(async () => null);
  listTeamsMock.mockImplementation(async () => [sampleTeam]);
  createTeamFromGoalMock.mockImplementation(async (goal: string) => ({
    ...sampleTeam,
    goal,
  }));
  startTeamRunMock.mockImplementation(async () => sampleRun);
  continueTeamRunMock.mockImplementation(async () => {
    throw new Error("unexpected continueTeamRun call");
  });
  addTeamRunAgentMock.mockImplementation(async () => {
    throw new Error("unexpected addTeamRunAgent call");
  });

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
    expect(view.container.querySelector('[aria-label="Composer entry modes"]')).toBeFalsy();
    expect(findText(view.container, "Provider required")).toBeFalsy();
    expect(findText(view.container, "Context Inspector")).toBeFalsy();
  });

  it("reveals direct chat and real team entry modes from the plus menu", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "+");

    expect(view.container.querySelector('[aria-label="Composer entry modes"]')).toBeTruthy();
    expect(findText(view.container, "Direct chat")).toBeTruthy();
    expect(findText(view.container, "Choose team")).toBeTruthy();
    expect(findText(view.container, "Create team")).toBeTruthy();
    expect(findText(view.container, "Choose workflow")).toBeFalsy();
    expect(findText(view.container, "Create workflow")).toBeFalsy();
  });

  it("opens the external editor draft flow and injects the returned content into the composer", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await setComposerValue(view.container, "Initial outline");
    await clickButton(view.container, "Draft");

    expect(invokeMock).toHaveBeenCalledWith(
      "open_external_prompt_draft",
      expect.objectContaining({ initialContent: "Initial outline" }),
    );

    const textarea = view.container.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(textarea?.value).toContain("Expanded draft from editor");
  });

  it("shows a choose-team pill and loads saved teams from the real team client", async () => {
    listTeamsMock.mockResolvedValueOnce([
      sampleTeam,
      {
        ...sampleTeam,
        id: "team-research",
        name: "Research Team",
      },
    ]);

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await clickButton(view.container, "+");
    await clickButton(view.container, "Choose team");

    const chooser = view.container.querySelector('[data-testid="chat-team-chooser"]');

    expect(chooser).toBeTruthy();
    expect(view.container.querySelector('[data-testid="chat-team-options"]')).toBeTruthy();
    expect(findText(view.container, "Release Team")).toBeTruthy();
    expect(findText(view.container, "Research Team")).toBeTruthy();
  });

  it("requires a saved team selection before starting a run from choose team mode", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await clickButton(view.container, "+");
    await clickButton(view.container, "Choose team");
    await setComposerValue(view.container, "Kick off the release run");
    await clickButton(view.container, "Send");

    expect(startTeamRunMock).not.toHaveBeenCalled();
    expect(findText(view.container, "Select a team before sending.")).toBeTruthy();
  });

  it("creates a team from chat without auto-starting a run", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await clickButton(view.container, "+");
    await clickButton(view.container, "Create team");
    await setComposerValue(view.container, "Ship the release and publish notes");
    await clickButton(view.container, "Send");

    expect(createTeamFromGoalMock).toHaveBeenCalledWith(
      "Ship the release and publish notes",
    );
    expect(startTeamRunMock).not.toHaveBeenCalled();
    expect(findText(view.container, "Team created: Release Team")).toBeTruthy();
    expect(view.container.querySelector('[aria-label="Team run session"]')).toBeFalsy();
  });

  it("starts a run from a selected team and continues it with the kickoff prompt", async () => {
    const updatedRun = {
      ...sampleRun,
      currentPhase: "analysis",
      events: [
        ...sampleRun.events,
        {
          id: "event-agenda",
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
    };

    listWorkspaceSessionsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "run-release",
          kind: "team_run",
          title: "Release Team Run",
          status: "active",
          updatedAt: "2026-03-11T12:15:00Z",
        },
      ]);
    continueTeamRunMock.mockResolvedValueOnce(updatedRun);
    loadWorkspaceSessionMock.mockResolvedValueOnce({
      kind: "team_run",
      run: updatedRun,
    });

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await clickButton(view.container, "+");
    await clickButton(view.container, "Choose team");
    await clickTeamOption(view.container, "team-release");
    await setComposerValue(view.container, "Re-check the remaining validation blocker.");
    await clickButton(view.container, "Send");

    expect(startTeamRunMock).toHaveBeenCalledWith("team-release");
    expect(continueTeamRunMock).toHaveBeenCalledWith(
      "run-release",
      "Re-check the remaining validation blocker.",
    );
    expect(findText(view.container, "Coordinator agenda")).toBeTruthy();
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
          run: sampleRun,
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
    expect(findText(view.container, "Ship the release and publish notes")).toBeTruthy();
    expect(findText(view.container, "Continue Run")).toBeTruthy();
  });

  it("renders browser-like uniform session tabs and clean session meta text", async () => {
    listWorkspaceSessionsMock.mockResolvedValueOnce([
      {
        id: "release-direct-session",
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

    loadWorkspaceSessionMock.mockResolvedValueOnce({
      kind: "direct_chat",
      session: {
        id: "release-direct-session",
        title: "Design Review Chat",
        providerId: "provider-local",
        messageCount: 2,
      },
      messages: [
        {
          id: "message-design-1",
          role: "user",
          content: "Check the design handoff",
        },
      ],
    });

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const tabList = view.container.querySelector(".session-tabs");
    const tabs = Array.from(view.container.querySelectorAll(".session-tab"));

    expect(tabList?.className).toContain("session-tabs--uniform");
    expect(tabs.length).toBeGreaterThan(1);
    expect(tabs.every((tab) => tab.className.includes("session-tab--uniform"))).toBe(true);
    expect(findText(view.container, "Session release-… · Direct chat")).toBeTruthy();
    expect(view.container.textContent?.includes("璺")).toBe(false);
    expect(view.container.textContent?.includes("鈥")).toBe(false);
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

    loadWorkspaceSessionMock.mockResolvedValueOnce({
      kind: "team_run",
      run: {
        ...sampleRun,
        status: "waiting_for_user",
        agents: [
          sampleRun.agents[0],
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
      },
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

    loadWorkspaceSessionMock.mockResolvedValue({
      kind: "team_run",
      run: sampleRun,
    });
    continueTeamRunMock.mockResolvedValueOnce({
      ...sampleRun,
      status: "active",
      currentPhase: "analysis",
      events: [
        ...sampleRun.events,
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
      ...sampleRun,
      agents: [
        ...sampleRun.agents,
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

    await setFieldValue(
      view.container,
      "Team run follow-up",
      "Re-check the remaining validation blocker.",
    );
    await clickButton(view.container, "Continue Run");

    expect(continueTeamRunMock).toHaveBeenCalledWith(
      "run-release",
      "Re-check the remaining validation blocker.",
    );
    expect(findText(view.container, "Coordinator agenda")).toBeTruthy();

    await clickButton(view.container, "Add Agent");
    await setFieldValue(view.container, "Agent name", "Scribe");
    await setFieldValue(view.container, "Agent role", "Writer");
    await setFieldValue(
      view.container,
      "Agent responsibility",
      "Capture the final handoff.",
    );
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
    );
    expect(view.container.querySelector('[aria-label="World conversation surface"]')).toBeTruthy();
    expect(findText(view.container, "Context Inspector")).toBeFalsy();
    expect(findText(view.container, "Summarize today's notes")).toBeTruthy();
    expect(view.container.querySelector('[aria-label="Suggested next steps"]')).toBeTruthy();
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
        body: "Remember the final sign-off order and the release owner handoff.",
        relatedTitles: ["Release Workflow", "Owner Register"],
      } as MemoryCandidate,
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
    expect(findText(view.container, "Release Checklist Memory")).toBeTruthy();
    expect(
      findText(
        view.container,
        "Remember the final sign-off order and the release owner handoff.",
      ),
    ).toBeTruthy();
    expect(findText(view.container, "Release Workflow")).toBeTruthy();
    expect(findText(view.container, "Owner Register")).toBeTruthy();
    expect(findText(view.container, "转入长期")).toBeTruthy();
    expect(findText(view.container, "留存短期")).toBeTruthy();
    expect(findText(view.container, "拒绝")).toBeTruthy();
    expect(findText(view.container, "Agent memory review")).toBeFalsy();
    expect(findText(view.container, "Chat turn proposed for review")).toBeFalsy();
    expect(findText(view.container, "应用审核")).toBeFalsy();
    expect(findText(view.container, "Schema schema-release")).toBeFalsy();

    await clickButton(view.container, "留存短期");

    expect(reviewMemoryCandidateMock).toHaveBeenCalledWith(
      "candidate-chat-1",
      "keep_episodic",
    );
  });

  it("prevents overlapping sends while routing is active", async () => {
    const firstResponse = {
      session: {
        id: "session-123",
        title: "Summarize today's notes",
        providerId: "provider-local",
        messageCount: 1,
      },
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

    const suggestionButton = getButtonByText(view.container, "Plan my next team");
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
