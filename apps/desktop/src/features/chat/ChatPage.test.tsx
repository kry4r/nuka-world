import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPage } from "./ChatPage";
import type { MemoryCandidate } from "@/lib/memory";
import type { ProviderRecord } from "@/lib/providers";
import type { ChatMessage } from "@/lib/chat";
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

type RouteWorldPromptMockResult = {
  session: {
    id: string;
    title: string;
    providerId: string | null;
    messageCount: number;
    routing: {
      requestedProviderId: string | null;
      requestedModel: string | null;
      effectiveProviderId: string;
      effectiveModel: string;
      fallbackProviderId: string | null;
      failoverReason: string | null;
    } | null;
  };
  messages: ChatMessage[];
  provider: {
    id: string;
    name: string;
    model: string;
    baseUrl: string;
  } | null;
  output: string;
  exitStatus: string;
  routing: {
    requestedProviderId: string | null;
    requestedModel: string | null;
    effectiveProviderId: string;
    effectiveModel: string;
    fallbackProviderId: string | null;
    failoverReason: string | null;
  } | null;
  context: {
    attachedAgents: string[];
    attachedKnowledgeLibraries: string[];
  };
};

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
  routing: null,
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

const sampleProviders: ProviderRecord[] = [
  {
    id: "provider-local",
    name: "Local",
    baseUrl: "http://localhost:11434/v1",
    model: "gpt-oss",
    apiKey: "",
    hasSecret: false,
    secretUpdatedAt: null,
    local: true,
    enabled: true,
  },
  {
    id: "provider-broken",
    name: "Broken",
    baseUrl: "http://127.0.0.1:17882/v1",
    model: "",
    apiKey: "",
    hasSecret: false,
    secretUpdatedAt: null,
    local: false,
    enabled: true,
  },
  {
    id: "provider-fallback",
    name: "Fallback",
    baseUrl: "http://127.0.0.1:17882/v1",
    model: "gpt-oss-fallback",
    apiKey: "",
    hasSecret: false,
    secretUpdatedAt: null,
    local: false,
    enabled: true,
  },
];

const routeWorldPromptMock = vi.fn<
  (
    prompt: string,
    sessionId?: string,
    routing?: { requestedProviderId: string | null; requestedModel: string | null },
  ) => Promise<RouteWorldPromptMockResult>
>(
  async (
    prompt: string,
    sessionId?: string,
    routing?: { requestedProviderId: string | null; requestedModel: string | null },
  ) => {
    if (prompt === "Broken provider") {
      throw new Error("default provider is not configured");
    }

    const requestedProvider = sampleProviders.find(
      (provider) => provider.id === routing?.requestedProviderId,
    );
    const effectiveProvider = requestedProvider ?? sampleProviders[0];
    const effectiveModel = routing?.requestedModel ?? effectiveProvider.model;
    const routeState = routing
      ? {
          requestedProviderId: routing.requestedProviderId,
          requestedModel: routing.requestedModel,
          effectiveProviderId: effectiveProvider.id,
          effectiveModel,
          fallbackProviderId: null,
          failoverReason: null,
        }
      : null;

    return {
      session: {
        id: sessionId ?? "session-123",
        title: "Summarize today's notes",
        providerId: effectiveProvider.id,
        messageCount: sessionId ? 2 : 1,
        routing: routeState,
      },
      messages: [
        {
          id: sessionId ? "message-user-2" : "message-user-1",
          role: "user" as const,
          content: prompt,
        },
      ],
      provider: {
        id: effectiveProvider.id,
        name: effectiveProvider.name,
        model: effectiveModel,
        baseUrl: effectiveProvider.baseUrl,
      },
      output: prompt,
      exitStatus: "completed",
      routing: routeState,
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

const {
  listWorkspaceSessionsMock,
  loadWorkspaceSessionMock,
  branchWorkspaceSessionMock,
} = vi.hoisted(() => ({
  listWorkspaceSessionsMock: vi.fn<() => Promise<WorkspaceSessionSummary[]>>(
    async () => [],
  ),
  loadWorkspaceSessionMock: vi.fn<
    (
      sessionId: string,
      kind: WorkspaceSessionSummary["kind"],
    ) => Promise<WorkspaceSessionDetail | null>
  >(async () => null),
  branchWorkspaceSessionMock: vi.fn<
    (
      sessionId: string,
      kind: WorkspaceSessionSummary["kind"],
      anchorId: string,
    ) => Promise<WorkspaceSessionSummary>
  >(async () => {
    throw new Error("unexpected branchWorkspaceSession call");
  }),
}));

const { listProvidersMock } = vi.hoisted(() => ({
  listProvidersMock: vi.fn<() => Promise<ProviderRecord[]>>(async () => sampleProviders),
}));

const {
  listTeamsMock,
  createTeamFromGoalMock,
  startTeamRunMock,
  continueTeamRunMock,
  addTeamRunAgentMock,
  retryTeamRunMock,
  resumeTeamRunMock,
} = vi.hoisted(() => ({
  listTeamsMock: vi.fn<() => Promise<TeamRecord[]>>(async () => [sampleTeam]),
  createTeamFromGoalMock: vi.fn<(goal: string) => Promise<TeamRecord>>(
    async (goal: string) => ({
      ...sampleTeam,
      goal,
    }),
  ),
  startTeamRunMock: vi.fn<
    (
      teamId: string,
      routing?: { requestedProviderId: string | null; requestedModel: string | null },
    ) => Promise<TeamRunRecord>
  >(
    async () => sampleRun,
  ),
  continueTeamRunMock: vi.fn<
    (
      runId: string,
      prompt: string,
      routing?: { requestedProviderId: string | null; requestedModel: string | null },
    ) => Promise<TeamRunRecord>
  >(
    async () => {
      throw new Error("unexpected continueTeamRun call");
    },
  ),
  addTeamRunAgentMock: vi.fn<
    (runId: string, agentSpec: RuntimeAgentInput) => Promise<TeamRunRecord>
  >(async () => {
    throw new Error("unexpected addTeamRunAgent call");
  }),
  retryTeamRunMock: vi.fn<(runId: string) => Promise<TeamRunRecord>>(async () => {
    throw new Error("unexpected retryTeamRun call");
  }),
  resumeTeamRunMock: vi.fn<(runId: string) => Promise<TeamRunRecord>>(async () => {
    throw new Error("unexpected resumeTeamRun call");
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
  branchWorkspaceSession: (
    ...args: Parameters<typeof branchWorkspaceSessionMock>
  ) => branchWorkspaceSessionMock(...args),
}));

vi.mock("@/lib/providers", () => ({
  listProviders: (...args: Parameters<typeof listProvidersMock>) =>
    listProvidersMock(...args),
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
  retryTeamRun: (...args: Parameters<typeof retryTeamRunMock>) =>
    retryTeamRunMock(...args),
  resumeTeamRun: (...args: Parameters<typeof resumeTeamRunMock>) =>
    resumeTeamRunMock(...args),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const cleanups: Array<() => Promise<void>> = [];

function getButtonByText(container: HTMLElement, text: string) {
  const normalizedText = text.trim().toLowerCase();

  return Array.from(container.querySelectorAll("button")).find(
    (button) => {
      const buttonText = button.textContent?.trim().toLowerCase() ?? "";
      const ariaLabel = button.getAttribute("aria-label")?.trim().toLowerCase() ?? "";
      const title = button.getAttribute("title")?.trim().toLowerCase() ?? "";

      return (
        buttonText === normalizedText ||
        buttonText.includes(normalizedText) ||
        ariaLabel === normalizedText ||
        ariaLabel.includes(normalizedText) ||
        title === normalizedText ||
        title.includes(normalizedText)
      );
    },
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

async function openRouteCard(container: HTMLElement) {
  const routeButton = container.querySelector(
    '[aria-label="Configure session route"]',
  ) as HTMLButtonElement | null;

  await act(async () => {
    routeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
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

async function setSelectValue(container: HTMLElement, label: string, value: string) {
  const field = Array.from(container.querySelectorAll("select")).find(
    (node) => node.getAttribute("aria-label") === label,
  ) as HTMLSelectElement | undefined;

  await act(async () => {
    if (!field) {
      throw new Error(`select missing: ${label}`);
    }

    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )?.set;

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

function captureToasts() {
  const toasts: Array<{ message?: string; tone?: string }> = [];
  const handleToast = (event: Event) => {
    toasts.push((event as CustomEvent<{ message?: string; tone?: string }>).detail);
  };

  window.addEventListener("nuka:toast", handleToast as EventListener);

  return {
    toasts,
    release: () => {
      window.removeEventListener("nuka:toast", handleToast as EventListener);
    },
  };
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
  routeWorldPromptMock.mockImplementation(
    async (
      prompt: string,
      sessionId?: string,
      routing?: { requestedProviderId: string | null; requestedModel: string | null },
    ) => {
      if (prompt === "Broken provider") {
        throw new Error("default provider is not configured");
      }

      const requestedProvider = sampleProviders.find(
        (provider) => provider.id === routing?.requestedProviderId,
      );
      const effectiveProvider = requestedProvider ?? sampleProviders[0];
      const effectiveModel = routing?.requestedModel ?? effectiveProvider.model;
      const routeState = routing
        ? {
            requestedProviderId: routing.requestedProviderId,
            requestedModel: routing.requestedModel,
            effectiveProviderId: effectiveProvider.id,
            effectiveModel,
            fallbackProviderId: null,
            failoverReason: null,
          }
        : null;

      return {
        session: {
          id: sessionId ?? "session-123",
          title: "Summarize today's notes",
          providerId: effectiveProvider.id,
          messageCount: sessionId ? 2 : 1,
          routing: routeState,
        },
        messages: [
          {
            id: sessionId ? "message-user-2" : "message-user-1",
            role: "user" as const,
            content: prompt,
          },
        ],
        provider: {
          id: effectiveProvider.id,
          name: effectiveProvider.name,
          model: effectiveModel,
          baseUrl: effectiveProvider.baseUrl,
        },
        output: prompt,
        exitStatus: "completed",
        routing: routeState,
        context: {
          attachedAgents: [],
          attachedKnowledgeLibraries: [],
        },
      };
    },
  );
  listPendingMemoryCandidatesMock.mockReset();
  reviewMemoryCandidateMock.mockReset();
  listWorkspaceSessionsMock.mockReset();
  loadWorkspaceSessionMock.mockReset();
  branchWorkspaceSessionMock.mockReset();
  listProvidersMock.mockReset();
  listTeamsMock.mockReset();
  createTeamFromGoalMock.mockReset();
  startTeamRunMock.mockReset();
  continueTeamRunMock.mockReset();
  addTeamRunAgentMock.mockReset();
  retryTeamRunMock.mockReset();
  resumeTeamRunMock.mockReset();

  listPendingMemoryCandidatesMock.mockImplementation(async () => []);
  reviewMemoryCandidateMock.mockImplementation(async () => undefined);
  listWorkspaceSessionsMock.mockImplementation(async () => []);
  loadWorkspaceSessionMock.mockImplementation(async () => null);
  branchWorkspaceSessionMock.mockImplementation(async () => {
    throw new Error("unexpected branchWorkspaceSession call");
  });
  listProvidersMock.mockImplementation(async () => sampleProviders);
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
  retryTeamRunMock.mockImplementation(async () => {
    throw new Error("unexpected retryTeamRun call");
  });
  resumeTeamRunMock.mockImplementation(async () => {
    throw new Error("unexpected resumeTeamRun call");
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

    const footer = view.container.querySelector(
      '[data-testid="chat-composer-footer"]',
    ) as HTMLElement | null;
    const routeStrip = view.container.querySelector(".chat-route-strip");
    const routeButton = view.container.querySelector(
      '[aria-label="Configure session route"]',
    ) as HTMLButtonElement | null;
    const draftButton = view.container.querySelector(
      '[aria-label="Open external draft"]',
    ) as HTMLButtonElement | null;
    const sendButton = view.container.querySelector(
      '[aria-label="Send to World"]',
    ) as HTMLButtonElement | null;

    expect(view.container.querySelector('[data-testid="chat-landing-stack"]')).toBeTruthy();
    expect(view.container.querySelector('[aria-label="World chat landing hero"]')).toBeTruthy();
    expect(view.container.querySelector("textarea")).toBeTruthy();
    expect(view.container.querySelector(".composer__add")).toBeTruthy();
    expect(view.container.querySelector(".composer__icon--plus")).toBeTruthy();
    expect(view.container.querySelector(".composer__icon--send")).toBeTruthy();
    expect(view.container.querySelector(".composer__icon--note")).toBeTruthy();
    expect(routeStrip).toBeFalsy();
    expect(footer).toBeTruthy();
    expect(routeButton && footer?.contains(routeButton)).toBe(true);
    expect(draftButton && footer?.contains(draftButton)).toBe(true);
    expect(routeButton?.className).toContain("composer__route-trigger");
    expect(draftButton?.className).toContain("composer__icon-action");
    expect(sendButton?.className).toContain("composer__send--circle");
    expect(view.container.querySelector('[aria-label="Composer entry modes"]')).toBeFalsy();
    expect(view.container.querySelector('[aria-label="Suggested next steps"]')).toBeFalsy();
    expect(findText(view.container, "Provider required")).toBeFalsy();
    expect(findText(view.container, "Context Inspector")).toBeFalsy();
  });

  it("opens a compact route card from the composer", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    expect(view.container.querySelector('[data-testid="chat-route-controls"]')).toBeFalsy();

    await openRouteCard(view.container);

    const providerSelect = view.container.querySelector(
      '[aria-label="Session provider"]',
    ) as HTMLSelectElement | null;

    expect(view.container.querySelector('[data-testid="chat-route-controls"]')).toBeTruthy();
    expect(providerSelect).toBeTruthy();
    expect(providerSelect?.className).toContain("chat-route-select--flat");
    expect(view.container.querySelector('[aria-label="Session model"]')).toBeTruthy();
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
    const toastCapture = captureToasts();

    try {
      await setComposerValue(view.container, "Initial outline");
      await act(async () => {
        (
          view.container.querySelector(
            '[aria-label="Open external draft"]',
          ) as HTMLButtonElement | null
        )?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(invokeMock).toHaveBeenCalledWith(
        "open_external_prompt_draft",
        expect.objectContaining({ initialContent: "Initial outline" }),
      );

      const textarea = view.container.querySelector("textarea") as HTMLTextAreaElement | null;
      expect(textarea?.value).toContain("Expanded draft from editor");
      expect(toastCapture.toasts).toContainEqual(
        expect.objectContaining({
          message: "Draft loaded from editor.",
          tone: "success",
        }),
      );
    } finally {
      toastCapture.release();
    }
  });

  it("emits a toast for external draft failures without rendering inline feedback", async () => {
    invokeMock.mockImplementationOnce(async (command: string) => {
      if (command === "open_external_prompt_draft") {
        throw new Error("external editor path is not configured");
      }

      throw new Error(`unexpected tauri command: ${command}`);
    });

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);
    const toastCapture = captureToasts();

    try {
      await act(async () => {
        (
          view.container.querySelector(
            '[aria-label="Open external draft"]',
          ) as HTMLButtonElement | null
        )?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(toastCapture.toasts).toContainEqual(
        expect.objectContaining({
          message: "external editor path is not configured",
          tone: "error",
        }),
      );
      expect(findText(view.container, "external editor path is not configured")).toBeFalsy();
    } finally {
      toastCapture.release();
    }
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
    const toastCapture = captureToasts();

    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await clickButton(view.container, "+");
      await clickButton(view.container, "Choose team");
      await setComposerValue(view.container, "Kick off the release run");
      await clickButton(view.container, "Send");

      expect(startTeamRunMock).not.toHaveBeenCalled();
      expect(toastCapture.toasts).toContainEqual(
        expect.objectContaining({
          message: "Select a team before sending.",
          tone: "error",
        }),
      );
      expect(findText(view.container, "Select a team before sending.")).toBeFalsy();
    } finally {
      toastCapture.release();
    }
  });

  it("creates a team from chat without auto-starting a run", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);
    const toastCapture = captureToasts();

    try {
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
      expect(toastCapture.toasts).toContainEqual(
        expect.objectContaining({
          message: "Team created: Release Team",
          tone: "success",
        }),
      );
      expect(findText(view.container, "Team created: Release Team")).toBeFalsy();
      expect(view.container.querySelector('[aria-label="Team run session"]')).toBeFalsy();
    } finally {
      toastCapture.release();
    }
  });

  it("emits a toast when direct routing fails without rendering composer inline feedback", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);
    const toastCapture = captureToasts();

    try {
      await setComposerValue(view.container, "Broken provider");
      await clickButton(view.container, "Send");

      expect(routeWorldPromptMock).toHaveBeenCalledWith("Broken provider", undefined);
      expect(toastCapture.toasts).toContainEqual(
        expect.objectContaining({
          message: "default provider is not configured",
          tone: "error",
        }),
      );
      expect(findText(view.container, "default provider is not configured")).toBeFalsy();
      expect(view.container.querySelector(".composer__inline-feedback")).toBeFalsy();
    } finally {
      toastCapture.release();
    }
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
            routing: null,
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

  it("clears stale team-run content immediately while switching to a direct chat tab", async () => {
    const directDetail = deferredValue<WorkspaceSessionDetail | null>();

    listWorkspaceSessionsMock.mockResolvedValueOnce([
      {
        id: "run-release",
        kind: "team_run",
        title: "Release Team Run",
        status: "waiting_for_user",
        updatedAt: "2026-03-11T12:15:00Z",
      },
      {
        id: "session-direct",
        kind: "direct_chat",
        title: "Branch Session",
        status: "active",
        updatedAt: "2026-03-11T12:16:00Z",
      },
    ]);

    loadWorkspaceSessionMock.mockImplementation(async (sessionId: string, kind: string) => {
      if (sessionId === "run-release" && kind === "team_run") {
        return {
          kind: "team_run",
          run: sampleRun,
        };
      }

      if (sessionId === "session-direct" && kind === "direct_chat") {
        return directDetail.promise;
      }

      return null;
    });

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await clickButton(view.container, "Branch Session");

    expect(view.container.querySelector('[aria-label="Team run session"]')).toBeFalsy();
    expect(view.container.querySelector('[aria-label="World conversation surface"]')).toBeFalsy();

    await act(async () => {
      directDetail.resolve({
        kind: "direct_chat",
        session: {
          id: "session-direct",
          title: "Branch Session",
          providerId: "provider-local",
          messageCount: 2,
          routing: null,
        },
        messages: [
          {
            id: "message-user-1",
            role: "user",
            content: "Reply with exactly: OK",
          },
          {
            id: "message-assistant-1",
            role: "assistant",
            content: "OK",
          },
        ],
      });
      await directDetail.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.container.querySelector('[aria-label="World conversation surface"]')).toBeTruthy();
    expect(findText(view.container, "OK")).toBeTruthy();
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
        routing: null,
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

  it("marks branched sessions in the top tabs", async () => {
    listWorkspaceSessionsMock.mockResolvedValueOnce([
      {
        id: "release-direct-session",
        kind: "direct_chat",
        title: "Design Review Chat",
        status: "active",
        updatedAt: "2026-03-11T12:05:00Z",
      },
      {
        id: "release-direct-session-branch-1",
        kind: "direct_chat",
        title: "Design Review Chat / Branch 1",
        status: "active",
        updatedAt: "2026-03-11T12:15:00Z",
        lineage: {
          rootId: "release-direct-session",
          parentId: "release-direct-session",
          snapshotId: "snapshot-design-1",
          anchorId: "message-design-1",
        },
      },
    ]);

    loadWorkspaceSessionMock.mockResolvedValueOnce({
      kind: "direct_chat",
      session: {
        id: "release-direct-session",
        title: "Design Review Chat",
        providerId: "provider-local",
        messageCount: 2,
        routing: null,
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

    expect(view.container.querySelector(".session-tab__branch")).toBeTruthy();
    expect(findText(view.container, "Design Review Chat / Branch 1")).toBeTruthy();
  });

  it("branches a direct chat from a visible message anchor", async () => {
    listWorkspaceSessionsMock
      .mockResolvedValueOnce([
        {
          id: "release-direct-session",
          kind: "direct_chat",
          title: "Design Review Chat",
          status: "active",
          updatedAt: "2026-03-11T12:05:00Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "release-direct-session-branch-1",
          kind: "direct_chat",
          title: "Design Review Chat / Branch 1",
          status: "active",
          updatedAt: "2026-03-11T12:15:00Z",
          lineage: {
            rootId: "release-direct-session",
            parentId: "release-direct-session",
            snapshotId: "snapshot-design-1",
            anchorId: "message-design-1",
          },
        },
        {
          id: "release-direct-session",
          kind: "direct_chat",
          title: "Design Review Chat",
          status: "active",
          updatedAt: "2026-03-11T12:05:00Z",
        },
      ]);

    loadWorkspaceSessionMock.mockImplementation(async (sessionId: string, kind: string) => {
      if (sessionId === "release-direct-session" && kind === "direct_chat") {
        return {
          kind: "direct_chat",
          session: {
            id: "release-direct-session",
            title: "Design Review Chat",
            providerId: "provider-local",
            messageCount: 2,
            routing: null,
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

      if (sessionId === "release-direct-session-branch-1" && kind === "direct_chat") {
        return {
          kind: "direct_chat",
          session: {
            id: "release-direct-session-branch-1",
            title: "Design Review Chat / Branch 1",
            providerId: "provider-local",
            messageCount: 1,
            routing: null,
          },
          messages: [
            {
              id: "message-design-branch-1",
              role: "user",
              content: "Check the branched design path",
            },
          ],
        };
      }

      return null;
    });

    branchWorkspaceSessionMock.mockResolvedValueOnce({
      id: "release-direct-session-branch-1",
      kind: "direct_chat",
      title: "Design Review Chat / Branch 1",
      status: "active",
      updatedAt: "2026-03-11T12:15:00Z",
      lineage: {
        rootId: "release-direct-session",
        parentId: "release-direct-session",
        snapshotId: "snapshot-design-1",
        anchorId: "message-design-1",
      },
    });

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const branchButton = view.container.querySelector(
      'button[aria-label="Branch from this turn"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      branchButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(branchWorkspaceSessionMock).toHaveBeenCalledWith(
      "release-direct-session",
      "direct_chat",
      "message-design-1",
    );
    expect(findText(view.container, "Check the branched design path")).toBeTruthy();
  });

  it("branches a team run from a visible event anchor", async () => {
    listWorkspaceSessionsMock
      .mockResolvedValueOnce([
        {
          id: "run-release",
          kind: "team_run",
          title: "Release Team Run",
          status: "waiting_for_user",
          updatedAt: "2026-03-11T12:15:00Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "run-release-branch-1",
          kind: "team_run",
          title: "Release Team Run / Branch 1",
          status: "active",
          updatedAt: "2026-03-11T12:18:00Z",
          lineage: {
            rootId: "run-release",
            parentId: "run-release",
            snapshotId: "snapshot-run-1",
            anchorId: "event-checkpoint",
          },
        },
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
          run: sampleRun,
        };
      }

      if (sessionId === "run-release-branch-1" && kind === "team_run") {
        return {
          kind: "team_run",
          run: {
            ...sampleRun,
            id: "run-release-branch-1",
            title: "Release Team Run / Branch 1",
            events: [
              {
                ...sampleRun.events[0],
                id: "event-branch-summary",
                runId: "run-release-branch-1",
                content: "Branch follow-up summary",
              },
            ],
          },
        };
      }

      return null;
    });

    branchWorkspaceSessionMock.mockResolvedValueOnce({
      id: "run-release-branch-1",
      kind: "team_run",
      title: "Release Team Run / Branch 1",
      status: "active",
      updatedAt: "2026-03-11T12:18:00Z",
      lineage: {
        rootId: "run-release",
        parentId: "run-release",
        snapshotId: "snapshot-run-1",
        anchorId: "event-checkpoint",
      },
    });

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const branchButton = view.container.querySelector(
      'button[aria-label="Branch from this event"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      branchButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(branchWorkspaceSessionMock).toHaveBeenCalledWith(
      "run-release",
      "team_run",
      "event-checkpoint",
    );
    expect(findText(view.container, "Branch follow-up summary")).toBeTruthy();
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
            sourceAgentId: null,
            sourceTeamAssignmentId: null,
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
    expect(findText(view.container, "Using Search Knowledge")).toBeTruthy();
    expect(findText(view.container, "Checkpoint summary")).toBeTruthy();
    expect(findText(view.container, "checkpoint_summary")).toBeFalsy();
    expect(findText(view.container, "waiting_for_user")).toBeFalsy();
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
          sourceAgentId: null,
          sourceTeamAssignmentId: null,
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

  it("shows the run queue and retries a blocked run from chat", async () => {
    listWorkspaceSessionsMock.mockResolvedValueOnce([
      {
        id: "run-release",
        kind: "team_run",
        title: "Release Team Run",
        status: "blocked",
        updatedAt: "2026-03-11T12:15:00Z",
      },
      {
        id: "run-queued",
        kind: "team_run",
        title: "Queued Ops Run",
        status: "queued",
        updatedAt: "2026-03-11T12:14:00Z",
      },
    ]);
    const blockedRun = {
      ...sampleRun,
      status: "blocked",
      events: [
        ...sampleRun.events,
        {
          id: "event-blocked",
          runId: "run-release",
          kind: "run_blocked",
          agentId: null,
          title: "Run blocked",
          content: "provider route resolution failed",
          status: "blocked",
          toolName: null,
          toolCallId: null,
          toolTarget: null,
          sequence: 2,
          createdAt: "2026-03-11T12:15:00Z",
        },
      ],
    } as TeamRunRecord;
    const resumedRun = {
      ...sampleRun,
      status: "waiting_for_user",
      events: [
        ...sampleRun.events,
        {
          id: "event-resumed",
          runId: "run-release",
          kind: "run_resumed",
          agentId: null,
          title: "Run resumed",
          content: "Retrying from the last checkpoint.",
          status: "completed",
          toolName: null,
          toolCallId: null,
          toolTarget: null,
          sequence: 2,
          createdAt: "2026-03-11T12:16:00Z",
        },
      ],
    } as TeamRunRecord;

    loadWorkspaceSessionMock
      .mockResolvedValueOnce({
        kind: "team_run",
        run: blockedRun,
      })
      .mockResolvedValueOnce({
        kind: "team_run",
        run: resumedRun,
      });
    retryTeamRunMock.mockResolvedValueOnce(resumedRun);

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findText(view.container, "Run queue")).toBeTruthy();
    expect(findText(view.container, "Queued Ops Run")).toBeTruthy();
    expect(findText(view.container, "Retry Run")).toBeTruthy();

    await clickButton(view.container, "Retry Run");

    expect(retryTeamRunMock).toHaveBeenCalledWith("run-release");
    expect(findText(view.container, "Run resumed")).toBeTruthy();
  });

  it("shows resume controls when a run is projected as stuck", async () => {
    listWorkspaceSessionsMock.mockResolvedValueOnce([
      {
        id: "run-release",
        kind: "team_run",
        title: "Release Team Run",
        status: "stuck",
        updatedAt: "2026-03-11T12:15:00Z",
      },
    ]);
    const activeRun = {
      ...sampleRun,
      status: "active",
    } as TeamRunRecord;
    const resumedRun = {
      ...sampleRun,
      status: "waiting_for_user",
      events: [
        ...sampleRun.events,
        {
          id: "event-resumed",
          runId: "run-release",
          kind: "run_resumed",
          agentId: null,
          title: "Run resumed",
          content: "Continuing from the last pending instruction.",
          status: "completed",
          toolName: null,
          toolCallId: null,
          toolTarget: null,
          sequence: 2,
          createdAt: "2026-03-11T12:16:00Z",
        },
      ],
    } as TeamRunRecord;

    loadWorkspaceSessionMock
      .mockResolvedValueOnce({
        kind: "team_run",
        run: activeRun,
      })
      .mockResolvedValueOnce({
        kind: "team_run",
        run: resumedRun,
      });
    resumeTeamRunMock.mockResolvedValueOnce(resumedRun);

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findText(view.container, "Resume Run")).toBeTruthy();

    await clickButton(view.container, "Resume Run");

    expect(resumeTeamRunMock).toHaveBeenCalledWith("run-release");
    expect(findText(view.container, "Run resumed")).toBeTruthy();
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
    expect(view.container.querySelector('[aria-label="Suggested next steps"]')).toBeFalsy();
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
        routing: null,
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
      output: "Start a release review",
      exitStatus: "completed" as const,
      routing: null,
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

    const sendButton = view.container.querySelector(
      '[aria-label="Send"]',
    ) as HTMLButtonElement | null;
    expect(sendButton?.disabled).toBe(true);

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

  it("refreshes the active direct session after continuing an existing branch", async () => {
    listWorkspaceSessionsMock
      .mockResolvedValueOnce([
        {
          id: "session-branch-1",
          kind: "direct_chat",
          title: "Branch Session",
          status: "active",
          updatedAt: "2026-03-11T12:05:00Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "session-branch-1",
          kind: "direct_chat",
          title: "Branch Session",
          status: "active",
          updatedAt: "2026-03-11T12:06:00Z",
        },
      ]);

    loadWorkspaceSessionMock
      .mockResolvedValueOnce({
        kind: "direct_chat",
        session: {
          id: "session-branch-1",
          title: "Branch Session",
          providerId: "provider-local",
          messageCount: 2,
          routing: null,
        },
        messages: [
          {
            id: "message-user-1",
            role: "user",
            content: "Reply with exactly: OK",
          },
          {
            id: "message-assistant-1",
            role: "assistant",
            content: "OK",
          },
        ],
      })
      .mockResolvedValueOnce({
        kind: "direct_chat",
        session: {
          id: "session-branch-1",
          title: "Branch Session",
          providerId: "provider-local",
          messageCount: 4,
          routing: null,
        },
        messages: [
          {
            id: "message-user-1",
            role: "user",
            content: "Reply with exactly: OK",
          },
          {
            id: "message-assistant-1",
            role: "assistant",
            content: "OK",
          },
          {
            id: "message-user-2",
            role: "user",
            content: "Continue this branch with exactly: BRANCH OK",
          },
          {
            id: "message-assistant-2",
            role: "assistant",
            content: "BRANCH OK",
          },
        ],
      });

    const branchContinuationResponse = {
      session: {
        id: "session-branch-1",
        title: "Branch Session",
        providerId: "provider-local",
        messageCount: 4,
        routing: null,
      },
      messages: [
        {
          id: "message-user-2",
          role: "user" as const,
          content: "Continue this branch with exactly: BRANCH OK",
        },
        {
          id: "message-assistant-2",
          role: "assistant" as const,
          content: "BRANCH OK",
        },
      ] as ChatMessage[],
      provider: {
        id: "provider-local",
        name: "Local",
        model: "gpt-oss",
        baseUrl: "http://localhost:11434/v1",
      },
      output: "BRANCH OK",
      exitStatus: "completed",
      routing: null,
      context: {
        attachedAgents: [],
        attachedKnowledgeLibraries: [],
      },
    };

    routeWorldPromptMock.mockResolvedValueOnce(branchContinuationResponse);

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await setComposerValue(view.container, "Continue this branch with exactly: BRANCH OK");
    await clickButton(view.container, "Send");

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(routeWorldPromptMock).toHaveBeenCalledWith(
      "Continue this branch with exactly: BRANCH OK",
      "session-branch-1",
    );
    expect(loadWorkspaceSessionMock).toHaveBeenCalledTimes(2);
    expect(findText(view.container, "BRANCH OK")).toBeTruthy();
  });

  it("routes direct chat with session-level provider and model overrides", async () => {
    routeWorldPromptMock.mockResolvedValueOnce({
      session: {
        id: "session-route-direct",
        title: "Route direct chat",
        providerId: "provider-fallback",
        messageCount: 1,
        routing: {
          requestedProviderId: "provider-fallback",
          requestedModel: "gpt-4.1-mini",
          effectiveProviderId: "provider-fallback",
          effectiveModel: "gpt-4.1-mini",
          fallbackProviderId: null,
          failoverReason: null,
        },
      },
      messages: [
        {
          id: "message-route-direct",
          role: "user" as const,
          content: "Route this directly",
        },
      ],
      output: "Route this directly",
      exitStatus: "completed",
      provider: {
        id: "provider-fallback",
        name: "Fallback",
        model: "gpt-4.1-mini",
        baseUrl: "http://127.0.0.1:17882/v1",
      },
      routing: {
        requestedProviderId: "provider-fallback",
        requestedModel: "gpt-4.1-mini",
        effectiveProviderId: "provider-fallback",
        effectiveModel: "gpt-4.1-mini",
        fallbackProviderId: null,
        failoverReason: null,
      },
      context: {
        attachedAgents: [],
        attachedKnowledgeLibraries: [],
      },
    });

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await openRouteCard(view.container);
    await setSelectValue(view.container, "Session provider", "provider-fallback");
    await setFieldValue(view.container, "Session model", "gpt-4.1-mini");
    await setComposerValue(view.container, "Route this directly");
    await clickButton(view.container, "Send");

    expect(routeWorldPromptMock).toHaveBeenCalledWith(
      "Route this directly",
      undefined,
      {
        requestedProviderId: "provider-fallback",
        requestedModel: "gpt-4.1-mini",
      },
    );

    const routeButton = view.container.querySelector(
      '[aria-label="Configure session route"]',
    ) as HTMLButtonElement | null;

    expect(view.container.querySelector('[data-testid="chat-routing-state"]')).toBeFalsy();
    expect(routeButton?.textContent).toContain("gpt-4.1-mini");
  });

  it("renders the compact chat chrome for an active direct session", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await setComposerValue(view.container, "Summarize today's notes");
    await clickButton(view.container, "Send");

    const routeButton = view.container.querySelector(
      '[aria-label="Configure session route"]',
    ) as HTMLButtonElement | null;
    const draftButton = view.container.querySelector(
      '[aria-label="Open external draft"]',
    ) as HTMLButtonElement | null;
    const sendButton = view.container.querySelector(
      '[aria-label="Send"]',
    ) as HTMLButtonElement | null;
    const tabList = view.container.querySelector(".session-tabs");

    expect(view.container.querySelector('[aria-label="Suggested next steps"]')).toBeFalsy();
    expect(view.container.querySelector(".chat-route-card")).toBeFalsy();
    expect(routeButton?.textContent).toContain("gpt-oss");
    expect(routeButton?.textContent).not.toContain("Desktop default");
    expect(draftButton?.className).toContain("composer__icon-action");
    expect(sendButton?.className).toContain("composer__send--circle");
    expect(sendButton?.textContent?.trim()).toBe("");
    expect(tabList?.className).toContain("session-tabs--attached");
  });

  it("shows deterministic team-run failover state for the active route", async () => {
    startTeamRunMock.mockResolvedValueOnce({
      ...sampleRun,
      routing: {
        requestedProviderId: "provider-broken",
        requestedModel: null,
        effectiveProviderId: "provider-fallback",
        effectiveModel: "gpt-oss-fallback",
        fallbackProviderId: "provider-fallback",
        failoverReason: "missing_model",
      },
    } as TeamRunRecord);
    continueTeamRunMock.mockResolvedValueOnce({
      ...sampleRun,
      routing: {
        requestedProviderId: "provider-broken",
        requestedModel: null,
        effectiveProviderId: "provider-fallback",
        effectiveModel: "gpt-oss-fallback",
        fallbackProviderId: "provider-fallback",
        failoverReason: "missing_model",
      },
    } as TeamRunRecord);

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await clickButton(view.container, "+");
    await clickButton(view.container, "Choose team");
    await clickTeamOption(view.container, "team-release");
    await openRouteCard(view.container);
    await setSelectValue(view.container, "Session provider", "provider-broken");
    await setComposerValue(view.container, "Kick off the release");
    await clickButton(view.container, "Send");

    expect(startTeamRunMock).toHaveBeenCalledWith("team-release", {
      requestedProviderId: "provider-broken",
      requestedModel: null,
    });
    expect(continueTeamRunMock).toHaveBeenCalledWith(
      "run-release",
      "Kick off the release",
      {
        requestedProviderId: "provider-broken",
        requestedModel: null,
      },
    );

    expect(view.container.querySelector('[data-testid="team-run-routing-state"]')).toBeFalsy();
    expect(view.container.querySelector(".chat-route-card")).toBeFalsy();
  });
});
