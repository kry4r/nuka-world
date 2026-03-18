import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPage } from "./ChatPage";
import type { MemoryCandidate } from "@/lib/memory";
import type { ProviderRecord } from "@/lib/providers";
import type { ChatMessage } from "@/lib/chat";
import type { RuntimeAgentInput, TeamRecord, TeamRunRecord } from "@/lib/team";
import type {
  WorkspaceSessionDetail,
  WorkspaceSessionSummary,
} from "@/lib/workspace";
import { findText, renderIntoDocument } from "@/test/render";

const DESKTOP_LOCALE_STORAGE_KEY = "nuka.desktop.locale";

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

type RouteWorldPromptStreamHandlers = {
  onStarted?: (event: {
    session: RouteWorldPromptMockResult["session"];
    provider: RouteWorldPromptMockResult["provider"];
    routing: RouteWorldPromptMockResult["routing"];
  }) => void;
  onDelta?: (event: { content: string }) => void;
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
  summary:
    "Coordinates release validation, notes, and final publish readiness.",
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
    routing?: {
      requestedProviderId: string | null;
      requestedModel: string | null;
    },
  ) => Promise<RouteWorldPromptMockResult>
>(
  async (
    prompt: string,
    sessionId?: string,
    routing?: {
      requestedProviderId: string | null;
      requestedModel: string | null;
    },
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

const routeWorldPromptStreamMock = vi.fn<
  (
    prompt: string,
    handlers: RouteWorldPromptStreamHandlers,
    sessionId?: string,
    routing?: {
      requestedProviderId: string | null;
      requestedModel: string | null;
    },
  ) => Promise<RouteWorldPromptMockResult>
>(async (prompt, handlers, sessionId, routing) => {
  const response = await routeWorldPromptMock(prompt, sessionId, routing);
  handlers.onStarted?.({
    session: response.session,
    provider: response.provider,
    routing: response.routing,
  });
  handlers.onDelta?.({
    content: "Seeded ",
  });
  handlers.onDelta?.({
    content: "assistant response",
  });
  return {
    ...response,
    messages: [
      {
        id: sessionId ? "message-user-stream-2" : "message-user-stream-1",
        role: "user",
        content: prompt,
      },
      {
        id: sessionId
          ? "message-assistant-stream-2"
          : "message-assistant-stream-1",
        role: "assistant",
        content: "Seeded assistant response",
      },
    ],
    output: "Seeded assistant response",
  };
});

const { providerGateState } = vi.hoisted(() => ({
  providerGateState: {
    ready: true,
    blocked: false,
    message: "Provider ready",
    openSettings: vi.fn(),
  },
}));

const { listPendingMemoryCandidatesMock, reviewMemoryCandidateMock } =
  vi.hoisted(() => ({
    listPendingMemoryCandidatesMock: vi.fn(
      async (): Promise<MemoryCandidate[]> => [],
    ),
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
  listProvidersMock: vi.fn<() => Promise<ProviderRecord[]>>(
    async () => sampleProviders,
  ),
}));

const {
  listTeamsMock,
  createTeamFromGoalMock,
  startTeamRunMock,
  loadTeamRunMock,
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
      routing?: {
        requestedProviderId: string | null;
        requestedModel: string | null;
      },
      prompt?: string,
    ) => Promise<TeamRunRecord>
  >(async () => sampleRun),
  loadTeamRunMock: vi.fn<(runId: string) => Promise<TeamRunRecord | null>>(
    async () => sampleRun,
  ),
  continueTeamRunMock: vi.fn<
    (
      runId: string,
      prompt: string,
      routing?: {
        requestedProviderId: string | null;
        requestedModel: string | null;
      },
    ) => Promise<TeamRunRecord>
  >(async () => {
    throw new Error("unexpected continueTeamRun call");
  }),
  addTeamRunAgentMock: vi.fn<
    (runId: string, agentSpec: RuntimeAgentInput) => Promise<TeamRunRecord>
  >(async () => {
    throw new Error("unexpected addTeamRunAgent call");
  }),
  retryTeamRunMock: vi.fn<(runId: string) => Promise<TeamRunRecord>>(
    async () => {
      throw new Error("unexpected retryTeamRun call");
    },
  ),
  resumeTeamRunMock: vi.fn<(runId: string) => Promise<TeamRunRecord>>(
    async () => {
      throw new Error("unexpected resumeTeamRun call");
    },
  ),
}));

vi.mock("@/lib/chat", () => ({
  routeWorldPrompt: (...args: Parameters<typeof routeWorldPromptMock>) =>
    routeWorldPromptMock(...args),
  routeWorldPromptStream: (
    ...args: Parameters<typeof routeWorldPromptStreamMock>
  ) => routeWorldPromptStreamMock(...args),
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
  listTeams: (...args: Parameters<typeof listTeamsMock>) =>
    listTeamsMock(...args),
  createTeamFromGoal: (...args: Parameters<typeof createTeamFromGoalMock>) =>
    createTeamFromGoalMock(...args),
  startTeamRun: (...args: Parameters<typeof startTeamRunMock>) =>
    startTeamRunMock(...args),
  loadTeamRun: (...args: Parameters<typeof loadTeamRunMock>) =>
    loadTeamRunMock(...args),
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

beforeEach(() => {
  window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "en-US");
});

function getButtonByText(container: HTMLElement, text: string) {
  const normalizedText = text.trim().toLowerCase();

  return Array.from(container.querySelectorAll("button")).find((button) => {
    const buttonText = button.textContent?.trim().toLowerCase() ?? "";
    const ariaLabel =
      button.getAttribute("aria-label")?.trim().toLowerCase() ?? "";
    const title = button.getAttribute("title")?.trim().toLowerCase() ?? "";

    return (
      buttonText === normalizedText ||
      buttonText.includes(normalizedText) ||
      ariaLabel === normalizedText ||
      ariaLabel.includes(normalizedText) ||
      title === normalizedText ||
      title.includes(normalizedText)
    );
  });
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
  const textarea = container.querySelector(
    "textarea",
  ) as HTMLTextAreaElement | null;

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

async function setFieldValue(
  container: HTMLElement,
  label: string,
  value: string,
) {
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

async function setSelectValue(
  container: HTMLElement,
  label: string,
  value: string,
) {
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
  const option = container.querySelector(
    `[data-team-id="${teamId}"]`,
  ) as HTMLButtonElement | null;

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
    toasts.push(
      (event as CustomEvent<{ message?: string; tone?: string }>).detail,
    );
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
  window.localStorage.clear();
  invokeMock.mockClear();
  invokeMock.mockImplementation(
    async (command: string, args?: Record<string, unknown>) => {
      switch (command) {
        case "open_external_prompt_draft":
          return `${String(args?.initialContent ?? "")}\nExpanded draft from editor`;
        default:
          throw new Error(`unexpected tauri command: ${command}`);
      }
    },
  );
  routeWorldPromptMock.mockReset();
  routeWorldPromptStreamMock.mockReset();
  routeWorldPromptMock.mockImplementation(
    async (
      prompt: string,
      sessionId?: string,
      routing?: {
        requestedProviderId: string | null;
        requestedModel: string | null;
      },
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
  routeWorldPromptStreamMock.mockImplementation(
    async (prompt, handlers, sessionId, routing) => {
      const response = await routeWorldPromptMock(prompt, sessionId, routing);
      handlers.onStarted?.({
        session: response.session,
        provider: response.provider,
        routing: response.routing,
      });
      handlers.onDelta?.({
        content: "Seeded ",
      });
      handlers.onDelta?.({
        content: "assistant response",
      });
      return {
        ...response,
        messages: [
          {
            id: sessionId ? "message-user-stream-2" : "message-user-stream-1",
            role: "user",
            content: prompt,
          },
          {
            id: sessionId
              ? "message-assistant-stream-2"
              : "message-assistant-stream-1",
            role: "assistant",
            content: "Seeded assistant response",
          },
        ],
        output: "Seeded assistant response",
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
  loadTeamRunMock.mockReset();
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
  loadTeamRunMock.mockImplementation(async () => sampleRun);
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
  it("defines a circular send button treatment in the chat theme", () => {
    const themeCss = readFileSync(
      resolve(process.cwd(), "src/styles/theme.css"),
      "utf8",
    );

    expect(themeCss).toMatch(
      /\.chat-page \.composer--active \.composer__send--circle\s*\{[^}]*width:\s*46px;[^}]*min-width:\s*46px;[^}]*height:\s*46px;[^}]*padding:\s*0;[^}]*border-radius:\s*999px;/s,
    );
  });

  it("renders only the logo hero and composer on first load", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    const footer = view.container.querySelector(
      '[data-testid="chat-composer-controls"]',
    ) as HTMLElement | null;
    const routeStrip = view.container.querySelector(".chat-route-strip");
    const routeButton = view.container.querySelector(
      '[aria-label="Configure session route"]',
    ) as HTMLButtonElement | null;
    const draftButton = view.container.querySelector(
      '[aria-label="Open external draft"]',
    ) as HTMLButtonElement | null;
    const sendButton = view.container.querySelector(
      '[aria-label="Send"]',
    ) as HTMLButtonElement | null;
    const sendPaths = Array.from(
      sendButton?.querySelectorAll("path") ?? [],
    ).map((node) => node.getAttribute("d"));
    const utilities = view.container.querySelector(".composer__utilities");
    const submit = view.container.querySelector(".composer__submit");

    expect(
      view.container.querySelector('[data-testid="chat-landing-stack"]'),
    ).toBeTruthy();
    expect(
      view.container.querySelector('[aria-label="Chat landing hero"]'),
    ).toBeTruthy();
    expect(view.container.querySelector(".session-tabs")).toBeFalsy();
    expect(
      view.container.querySelector('[data-testid="chat-session-titlebar"]'),
    ).toBeFalsy();
    expect(view.container.querySelector("textarea")).toBeTruthy();
    expect(view.container.querySelector(".composer__add")).toBeTruthy();
    expect(view.container.querySelector(".composer__icon--plus")).toBeTruthy();
    expect(view.container.querySelector(".composer__icon--send")).toBeTruthy();
    expect(view.container.querySelector(".composer__icon--note")).toBeTruthy();
    expect(routeStrip).toBeFalsy();
    expect(footer).toBeTruthy();
    expect(view.container.querySelector(".composer__footer")).toBeFalsy();
    expect(routeButton && utilities?.contains(routeButton)).toBe(true);
    expect(draftButton && utilities?.contains(draftButton)).toBe(true);
    expect(sendButton && submit?.contains(sendButton)).toBe(true);
    expect(routeButton?.className).toContain("composer__route-trigger");
    expect(draftButton?.className).toContain("composer__icon-action");
    expect(sendButton?.className).toContain("composer__send--circle");
    expect(sendPaths).toEqual(["M8 12.5v-8", "M4.5 7.5 8 4l3.5 3.5"]);
    expect(
      view.container.querySelector('[aria-label="Composer entry modes"]'),
    ).toBeFalsy();
    expect(
      view.container.querySelector('[aria-label="Suggested next steps"]'),
    ).toBeFalsy();
    expect(findText(view.container, "Provider required")).toBeFalsy();
    expect(findText(view.container, "Context Inspector")).toBeFalsy();
  });

  it("keeps the landing composer editable when provider setup is still missing", async () => {
    providerGateState.ready = false;
    providerGateState.blocked = true;
    providerGateState.message = "Provider required";
    const toastCapture = captureToasts();

    try {
      const view = await renderIntoDocument(<ChatPage />);
      cleanups.push(view.cleanup);

      const textarea = view.container.querySelector(
        "textarea.composer__input",
      ) as HTMLTextAreaElement | null;
      const sendButton = view.container.querySelector(
        '[aria-label="Send"]',
      ) as HTMLButtonElement | null;

      expect(textarea?.disabled).toBe(false);
      expect(sendButton?.disabled).toBe(true);

      await setComposerValue(
        view.container,
        "Document the blocker before setup.",
      );

      expect(textarea?.value).toBe("Document the blocker before setup.");

      await act(async () => {
        textarea?.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
        );
        await Promise.resolve();
      });

      expect(routeWorldPromptMock).not.toHaveBeenCalled();
      expect(toastCapture.toasts).toContainEqual(
        expect.objectContaining({
          message: "Configure a provider before sending.",
          tone: "error",
        }),
      );
    } finally {
      toastCapture.release();
    }
  });

  it("focuses the composer textarea when clicking the main input field", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    const field = view.container.querySelector(
      ".composer__field",
    ) as HTMLDivElement | null;
    const textarea = view.container.querySelector(
      "textarea.composer__input",
    ) as HTMLTextAreaElement | null;

    expect(field).toBeTruthy();
    expect(textarea).toBeTruthy();
    expect(document.activeElement).not.toBe(textarea);

    await act(async () => {
      field?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(textarea);
  });

  it("opens a compact route card from the composer", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    expect(
      view.container.querySelector('[data-testid="chat-route-controls"]'),
    ).toBeFalsy();

    await openRouteCard(view.container);

    const providerSelect = view.container.querySelector(
      '[aria-label="Session provider"]',
    ) as HTMLSelectElement | null;

    expect(
      view.container.querySelector('[data-testid="chat-route-controls"]'),
    ).toBeTruthy();
    expect(providerSelect).toBeTruthy();
    expect(providerSelect?.className).toContain("chat-route-select--flat");
    expect(
      view.container.querySelector('[aria-label="Session model"]'),
    ).toBeTruthy();
  });

  it("reveals 对话 and 协作团队 entry modes from the plus menu", async () => {
    window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "zh-CN");
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "+");

    expect(
      view.container.querySelector('[aria-label="Composer entry modes"]'),
    ).toBeTruthy();
    expect(findText(view.container, "对话")).toBeTruthy();
    expect(findText(view.container, "选择协作团队")).toBeTruthy();
    expect(findText(view.container, "新建协作团队")).toBeTruthy();
    expect(findText(view.container, "Direct chat")).toBeFalsy();
    expect(findText(view.container, "Choose team")).toBeFalsy();
    expect(findText(view.container, "Create team")).toBeFalsy();
    expect(findText(view.container, "Choose workflow")).toBeFalsy();
    expect(findText(view.container, "Create workflow")).toBeFalsy();
  });

  it("keeps 协作团队 wording throughout the composer flow", async () => {
    window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "zh-CN");
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "+");
    await clickButton(view.container, "选择协作团队");

    expect(findText(view.container, "选择协作团队")).toBeTruthy();
    expect(findText(view.container, "Select team")).toBeFalsy();

    await clickButton(view.container, "Clear team chooser");
    await clickButton(view.container, "+");
    await clickButton(view.container, "新建协作团队");

    expect(findText(view.container, "新建协作团队")).toBeTruthy();
    expect(findText(view.container, "Create team")).toBeFalsy();

    const textarea = view.container.querySelector("textarea");
    expect(textarea?.getAttribute("placeholder")).toContain("协作团队目标");
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

      const textarea = view.container.querySelector(
        "textarea",
      ) as HTMLTextAreaElement | null;
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
      expect(
        findText(view.container, "external editor path is not configured"),
      ).toBeFalsy();
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

    const chooser = view.container.querySelector(
      '[data-testid="chat-team-chooser"]',
    );

    expect(chooser).toBeTruthy();
    expect(
      view.container.querySelector('[data-testid="chat-team-options"]'),
    ).toBeTruthy();
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
      expect(
        findText(view.container, "Select a team before sending."),
      ).toBeFalsy();
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
      await setComposerValue(
        view.container,
        "Ship the release and publish notes",
      );
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
      expect(
        findText(view.container, "Team created: Release Team"),
      ).toBeFalsy();
      expect(
        view.container.querySelector('[aria-label="Team run session"]'),
      ).toBeFalsy();
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

      expect(routeWorldPromptStreamMock).toHaveBeenCalledWith(
        "Broken provider",
        expect.any(Object),
        undefined,
        undefined,
      );
      expect(toastCapture.toasts).toContainEqual(
        expect.objectContaining({
          message: "default provider is not configured",
          tone: "error",
        }),
      );
      expect(
        findText(view.container, "default provider is not configured"),
      ).toBeFalsy();
      expect(
        view.container.querySelector(".composer__inline-feedback"),
      ).toBeFalsy();
    } finally {
      toastCapture.release();
    }
  });

  it("starts a run from a selected team using the first prompt as the opening team round", async () => {
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

    listWorkspaceSessionsMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "run-release",
        kind: "team_run",
        title: "Release Team Run",
        status: "active",
        updatedAt: "2026-03-11T12:15:00Z",
      },
    ]);
    startTeamRunMock.mockResolvedValueOnce(updatedRun);
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
    await setComposerValue(
      view.container,
      "Re-check the remaining validation blocker.",
    );
    await clickButton(view.container, "Send");

    expect(startTeamRunMock).toHaveBeenCalledWith(
      "team-release",
      undefined,
      "Re-check the remaining validation blocker.",
    );
    expect(continueTeamRunMock).not.toHaveBeenCalled();
    expect(findText(view.container, "Coordinator agenda")).toBeTruthy();
  });

  it("refreshes an active team run so new events and files appear without remounting", async () => {
    vi.useFakeTimers();

    try {
      const initialRun: TeamRunRecord = {
        ...sampleRun,
        status: "queued",
        currentPhase: "kickoff",
        events: [
          {
            id: "event-run-started",
            runId: "run-release",
            kind: "run_started",
            agentId: null,
            title: "Run started",
            content: "Started from the release team.",
            status: "completed",
            toolName: null,
            toolCallId: null,
            toolTarget: null,
            sequence: 1,
            createdAt: "2026-03-11T12:12:00Z",
          },
        ],
      };

      const refreshedRun: TeamRunRecord = {
        ...initialRun,
        status: "waiting_for_user",
        currentPhase: "analysis",
        updatedAt: "2026-03-11T12:16:00Z",
        events: [
          ...initialRun.events,
          {
            id: "event-agenda",
            runId: "run-release",
            kind: "round_agenda",
            agentId: "agent-coordinator",
            title: "Coordinator agenda",
            content: "Summarize the first validation findings.",
            status: "completed",
            toolName: null,
            toolCallId: null,
            toolTarget: null,
            sequence: 2,
            createdAt: "2026-03-11T12:13:00Z",
          },
          {
            id: "event-file",
            runId: "run-release",
            kind: "file_change",
            agentId: "agent-coordinator",
            title: "Round 1",
            content: "agenda.md",
            status: "created",
            toolName: "session_artifacts",
            toolCallId: "round-01",
            toolTarget: "/tmp/team-runs/run-release/round-01/agenda.md",
            sequence: 3,
            createdAt: "2026-03-11T12:14:00Z",
          },
        ],
      };

      listWorkspaceSessionsMock.mockResolvedValueOnce([]).mockResolvedValue([
        {
          id: "run-release",
          kind: "team_run",
          title: "Release Team Run",
          status: "waiting_for_user",
          updatedAt: "2026-03-11T12:16:00Z",
        },
      ]);
      startTeamRunMock.mockResolvedValueOnce(initialRun);
      loadTeamRunMock.mockResolvedValueOnce(refreshedRun);
      loadWorkspaceSessionMock
        .mockResolvedValueOnce({
          kind: "team_run",
          run: initialRun,
        })
        .mockResolvedValueOnce({
          kind: "team_run",
          run: refreshedRun,
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
      await setComposerValue(view.container, "Kick off the release review.");
      await clickButton(view.container, "Send");

      expect(findText(view.container, "Coordinator agenda")).toBeFalsy();

      await act(async () => {
        vi.advanceTimersByTime(1600);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(findText(view.container, "Coordinator agenda")).toBeTruthy();

      await clickButton(view.container, "Files");

      expect(findText(view.container, "agenda.md")).toBeTruthy();
      expect(
        findText(view.container, "No run artifacts have been written yet."),
      ).toBeFalsy();
    } finally {
      vi.useRealTimers();
    }
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

    loadWorkspaceSessionMock.mockImplementation(
      async (sessionId: string, kind: string) => {
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
      },
    );

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

    expect(
      view.container.querySelector('[aria-label="Team run session"]'),
    ).toBeTruthy();
    expect(
      findText(view.container, "Ship the release and publish notes"),
    ).toBeTruthy();
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

    loadWorkspaceSessionMock.mockImplementation(
      async (sessionId: string, kind: string) => {
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
      },
    );

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await clickButton(view.container, "Branch Session");

    expect(
      view.container.querySelector('[aria-label="Team run session"]'),
    ).toBeFalsy();
    expect(
      view.container.querySelector('[aria-label="World conversation surface"]'),
    ).toBeFalsy();

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

    expect(
      view.container.querySelector('[aria-label="Chat conversation surface"]'),
    ).toBeTruthy();
    expect(findText(view.container, "OK")).toBeTruthy();
  });

  it("renders a browser-style session rail and lightweight direct-chat titlebar", async () => {
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

    const tabList = view.container.querySelector(
      ".session-tabs",
    ) as HTMLElement | null;
    const tabs = Array.from(view.container.querySelectorAll(".session-tab"));
    const titlebar = view.container.querySelector(
      '[data-testid="chat-session-titlebar"]',
    );
    const title = view.container.querySelector(".chat-session-titlebar__title");
    const closeButtons = Array.from(
      view.container.querySelectorAll('[aria-label^="Close session "]'),
    );
    const textarea = view.container.querySelector("textarea");

    expect(tabList?.className).toContain("session-tabs--scrollable");
    expect(tabList?.className).toContain("session-tabs--browser");
    expect(tabList?.className).toContain("session-tabs--dense");
    expect(tabList?.style.maxWidth).toBe("100%");
    expect(tabList?.style.overflowY).toBe("hidden");
    expect(tabList?.style.width).toBe("100%");
    expect(tabList?.style.paddingRight).toBe("16px");
    expect(tabList?.style.scrollPaddingRight).toBe("16px");
    expect(tabs.length).toBeGreaterThan(1);
    expect(view.container.querySelector(".session-tab__meta")).toBeFalsy();
    expect(view.container.querySelector(".session-tab__kind")).toBeFalsy();
    expect(
      view.container.querySelectorAll(".session-tab__content"),
    ).toHaveLength(tabs.length);
    expect(
      view.container.querySelectorAll(".session-tab__markers"),
    ).toHaveLength(1);
    expect(view.container.querySelector(".session-tab__title-row")).toBeFalsy();
    expect(titlebar).toBeTruthy();
    expect(titlebar?.textContent).toContain("Chat");
    expect(title?.textContent).toContain("Design Review Chat");
    expect(title?.getAttribute("title")).toBe("Design Review Chat");
    expect(view.container.querySelector(".chat-surface__meta")).toBeFalsy();
    expect(view.container.textContent?.includes("release-direct-session")).toBe(
      false,
    );
    expect(view.container.textContent?.includes("Direct chat")).toBe(false);
    expect(
      view.container.querySelector('[aria-label="World conversation surface"]'),
    ).toBeFalsy();
    expect(
      view.container.querySelector('[aria-label="Chat conversation surface"]'),
    ).toBeTruthy();
    expect(closeButtons.length).toBeGreaterThan(0);
    expect(
      closeButtons.every((button) => button.closest(".session-tab-shell")),
    ).toBe(true);
    expect(textarea?.getAttribute("placeholder")?.includes("World")).toBe(
      false,
    );
    expect(view.container.textContent?.includes("璺")).toBe(false);
    expect(view.container.textContent?.includes("鈥")).toBe(false);
  });

  it("reveals the close affordance when a session tab receives keyboard focus", async () => {
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
        messageCount: 1,
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

    const closeButton = view.container.querySelector(
      '[aria-label^="Close session "]',
    ) as HTMLButtonElement | null;
    const shell = closeButton?.closest(".session-tab-shell");

    expect(shell?.className.includes("is-revealed")).toBe(false);

    await act(async () => {
      closeButton?.focus();
      closeButton?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      await Promise.resolve();
    });

    expect(shell?.className).toContain("is-revealed");
  });

  it("shows the same lightweight titlebar contract for an active team run", async () => {
    listWorkspaceSessionsMock.mockResolvedValueOnce([
      {
        id: "run-release",
        kind: "team_run",
        title: "Release Team Run",
        status: "active",
        updatedAt: "2026-03-11T12:15:00Z",
      },
    ]);

    loadWorkspaceSessionMock.mockResolvedValueOnce({
      kind: "team_run",
      run: sampleRun,
    });

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const titlebar = view.container.querySelector(
      '[data-testid="chat-session-titlebar"]',
    );
    const title = view.container.querySelector(".chat-session-titlebar__title");

    expect(titlebar).toBeTruthy();
    expect(titlebar?.textContent).toContain("Team run");
    expect(title?.textContent).toContain("Release Team Run");
    expect(title?.getAttribute("title")).toBe("Release Team Run");
    expect(view.container.textContent?.includes("run-release")).toBe(false);
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

    expect(
      view.container.querySelector(".session-tab__marker--branch"),
    ).toBeTruthy();
    expect(
      findText(view.container, "Design Review Chat / Branch 1"),
    ).toBeTruthy();
  });

  it("closes an inactive session tab from the compact rail", async () => {
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
        messageCount: 1,
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

    const closeButton = view.container.querySelector(
      '[aria-label="Close session Release Team Run"]',
    ) as HTMLButtonElement | null;

    expect(closeButton).toBeTruthy();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(findText(view.container, "Release Team Run")).toBeFalsy();
    expect(findText(view.container, "Design Review Chat")).toBeTruthy();
  });

  it("returns to the landing state after closing the last active session tab", async () => {
    listWorkspaceSessionsMock.mockResolvedValueOnce([
      {
        id: "release-direct-session",
        kind: "direct_chat",
        title: "Design Review Chat",
        status: "active",
        updatedAt: "2026-03-11T12:05:00Z",
      },
    ]);

    loadWorkspaceSessionMock.mockResolvedValueOnce({
      kind: "direct_chat",
      session: {
        id: "release-direct-session",
        title: "Design Review Chat",
        providerId: "provider-local",
        messageCount: 1,
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

    const closeButton = view.container.querySelector(
      '[aria-label="Close session Design Review Chat"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.container.querySelector(".session-tabs")).toBeFalsy();
    expect(
      view.container.querySelector('[data-testid="chat-session-titlebar"]'),
    ).toBeFalsy();
    expect(
      view.container.querySelector('[data-testid="chat-landing-stack"]'),
    ).toBeTruthy();
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

    loadWorkspaceSessionMock.mockImplementation(
      async (sessionId: string, kind: string) => {
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

        if (
          sessionId === "release-direct-session-branch-1" &&
          kind === "direct_chat"
        ) {
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
      },
    );

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
    expect(
      findText(view.container, "Check the branched design path"),
    ).toBeTruthy();
  });

  it("renders compacted direct-chat context as an expandable inline notice and keeps assistant markdown readable", async () => {
    listWorkspaceSessionsMock.mockResolvedValueOnce([
      {
        id: "session-transcript",
        kind: "direct_chat",
        title: "Transcript Review",
        status: "active",
        updatedAt: "2026-03-11T12:05:00Z",
      },
    ]);

    loadWorkspaceSessionMock.mockResolvedValueOnce({
      kind: "direct_chat",
      session: {
        id: "session-transcript",
        title: "Transcript Review",
        providerId: "provider-local",
        messageCount: 4,
        routing: null,
      },
      messages: [
        {
          id: "message-compaction-1",
          role: "system",
          content: [
            "Compacted earlier chat context (4 messages):",
            "- user: Kick off the release review.",
            "- assistant: Reviewed the open checklist items.",
          ].join("\n"),
        },
        {
          id: "message-user-1",
          role: "user",
          content: "Show the final checklist.",
        },
        {
          id: "message-assistant-1",
          role: "assistant",
          content: [
            "## Final checklist",
            "",
            "- Verify release notes",
            "- Confirm sign-off",
            "",
            "Use `npm test` before shipping.",
          ].join("\n"),
        },
      ],
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
    const assistantBubble = findText(
      view.container,
      "Final checklist",
    )?.closest("article");

    expect(findText(view.container, "Earlier context compacted")).toBeTruthy();
    expect(
      findText(view.container, "assistant: Reviewed the open checklist items."),
    ).toBeFalsy();
    expect(branchButton?.className).toContain("chat-bubble__branch--anchor");
    expect(assistantBubble?.querySelector("ul")).toBeTruthy();
    expect(assistantBubble?.querySelector("code")?.textContent).toBe(
      "npm test",
    );

    await clickButton(view.container, "Show compacted summary");

    expect(
      findText(view.container, "assistant: Reviewed the open checklist items."),
    ).toBeTruthy();
  });

  it("renders thinking turns as disclosures and groups tool turns into the subdued system layer", async () => {
    listWorkspaceSessionsMock.mockResolvedValueOnce([
      {
        id: "session-thinking",
        kind: "direct_chat",
        title: "Thinking Review",
        status: "active",
        updatedAt: "2026-03-11T12:05:00Z",
      },
    ]);

    loadWorkspaceSessionMock.mockResolvedValueOnce({
      kind: "direct_chat",
      session: {
        id: "session-thinking",
        title: "Thinking Review",
        providerId: "provider-local",
        messageCount: 3,
        routing: null,
      },
      messages: [
        {
          id: "message-user-1",
          role: "user",
          content: "Audit the release blockers.",
        },
        {
          id: "message-thinking-1",
          role: "thinking" as unknown as ChatMessage["role"],
          content: "Cross-check the release checklist before responding.",
        },
        {
          id: "message-tool-1",
          role: "tool",
          content: "workspace/diffs/release-notes.md",
        },
      ],
    });

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findText(view.container, "Thinking trace")).toBeTruthy();
    expect(
      findText(
        view.container,
        "Cross-check the release checklist before responding.",
      ),
    ).toBeFalsy();

    await clickButton(view.container, "Show thinking trace");

    const toolBubble = view.container.querySelector(
      ".chat-bubble--system-tool",
    ) as HTMLElement | null;

    expect(
      findText(
        view.container,
        "Cross-check the release checklist before responding.",
      ),
    ).toBeTruthy();
    expect(toolBubble?.className).toContain("chat-bubble--system-tool");
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

    loadWorkspaceSessionMock.mockImplementation(
      async (sessionId: string, kind: string) => {
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
      },
    );

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

  it("branches a compacted team run from the source summary anchor", async () => {
    const compactedRun = {
      ...sampleRun,
      events: [
        {
          id: "event-compacted-anchor",
          runId: "run-release",
          kind: "compaction_summary",
          agentId: null,
          title: "Compacted context",
          content: [
            "Compacted earlier team run context (3 events):",
            "- user_instruction / User follow-up: Review the final notes carefully.",
            "- round_agenda / Coordinator agenda: Round agenda: focus on Review the final notes carefully.",
            "- checkpoint_summary / Checkpoint summary: Review checkpoint ready.",
          ].join("\n"),
          status: "completed",
          toolName: null,
          toolCallId: null,
          toolTarget: null,
          sequence: 1,
          createdAt: "2026-03-11T12:12:00Z",
        },
      ],
    } as TeamRunRecord;

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
          id: "run-release-branch-compacted",
          kind: "team_run",
          title: "Release Team Run / Branch Compacted",
          status: "active",
          updatedAt: "2026-03-11T12:18:00Z",
          lineage: {
            rootId: "run-release",
            parentId: "run-release",
            snapshotId: "snapshot-run-compacted",
            anchorId: "event-compacted-anchor",
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

    loadWorkspaceSessionMock.mockImplementation(
      async (sessionId: string, kind: string) => {
        if (sessionId === "run-release" && kind === "team_run") {
          return {
            kind: "team_run",
            run: compactedRun,
          };
        }

        if (
          sessionId === "run-release-branch-compacted" &&
          kind === "team_run"
        ) {
          return {
            kind: "team_run",
            run: {
              ...compactedRun,
              id: "run-release-branch-compacted",
              title: "Release Team Run / Branch Compacted",
              events: [
                {
                  ...sampleRun.events[0],
                  id: "event-branch-summary-compacted",
                  runId: "run-release-branch-compacted",
                  content: "Compacted branch follow-up summary",
                },
              ],
            },
          };
        }

        return null;
      },
    );

    branchWorkspaceSessionMock.mockResolvedValueOnce({
      id: "run-release-branch-compacted",
      kind: "team_run",
      title: "Release Team Run / Branch Compacted",
      status: "active",
      updatedAt: "2026-03-11T12:18:00Z",
      lineage: {
        rootId: "run-release",
        parentId: "run-release",
        snapshotId: "snapshot-run-compacted",
        anchorId: "event-compacted-anchor",
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
      "event-compacted-anchor",
    );
    expect(findText(view.container, "Compacted branch follow-up summary")).toBeTruthy();
  });

  it("keeps the active team run transcript-first and shows agent activity under the Agents view", async () => {
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
        events: [
          ...sampleRun.events,
          {
            id: "event-research-instruction",
            runId: "run-release",
            kind: "user_instruction",
            agentId: "agent-research",
            title: "Research brief",
            content: "Check evidence gaps.",
            status: null,
            toolName: null,
            toolCallId: null,
            toolTarget: null,
            sequence: 2,
            createdAt: "2026-03-11T12:09:00Z",
          },
          {
            id: "event-research-thinking",
            runId: "run-release",
            kind: "position_card",
            agentId: "agent-research",
            title: "Research notes",
            content: "Check evidence gaps.",
            status: "thinking",
            toolName: null,
            toolCallId: null,
            toolTarget: null,
            sequence: 3,
            createdAt: "2026-03-11T12:10:00Z",
          },
        ],
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
    expect(findText(view.container, "Checkpoint summary")).toBeTruthy();
    expect(findText(view.container, "checkpoint_summary")).toBeFalsy();
    expect(findText(view.container, "waiting_for_user")).toBeFalsy();
    expect(findText(view.container, "Add Agent")).toBeFalsy();

    await clickButton(view.container, "Agents");
    await clickButton(view.container, "Research");

    expect(findText(view.container, "Research brief")).toBeTruthy();
    expect(findText(view.container, "Research notes")).toBeTruthy();
    expect(findText(view.container, "Check evidence gaps.")).toBeTruthy();
  });

  it("continues a run from the fixed footer composer even after switching to Agents", async () => {
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
    continueTeamRunMock.mockResolvedValueOnce({
      ...sampleRun,
      status: "waiting_for_user",
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
        {
          id: "event-follow-up-2",
          runId: "run-release",
          kind: "round_agenda",
          agentId: "agent-coordinator",
          title: "Coordinator follow-up",
          content: "Capture the final handoff.",
          status: "completed",
          toolName: null,
          toolCallId: null,
          toolTarget: null,
          sequence: 3,
          createdAt: "2026-03-11T12:17:00Z",
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
      "Follow-up",
      "Re-check the remaining validation blocker.",
    );
    await clickButton(view.container, "Continue Run");

    expect(continueTeamRunMock).toHaveBeenCalledWith(
      "run-release",
      "Re-check the remaining validation blocker.",
    );
    expect(findText(view.container, "Coordinator agenda")).toBeTruthy();

    await clickButton(view.container, "Agents");
    expect(findText(view.container, "Add Agent")).toBeFalsy();

    await setFieldValue(
      view.container,
      "Follow-up",
      "Capture the final handoff.",
    );
    await clickButton(view.container, "Continue Run");

    expect(continueTeamRunMock).toHaveBeenLastCalledWith(
      "run-release",
      "Capture the final handoff.",
    );
    expect(addTeamRunAgentMock).not.toHaveBeenCalled();
    expect(findText(view.container, "Coordinator follow-up")).toBeTruthy();
  });

  it("keeps polling team-run detail after a stale waiting response so later round data still appears", async () => {
    vi.useFakeTimers();

    try {
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
        status: "waiting_for_user",
      });
      loadTeamRunMock.mockResolvedValueOnce({
        ...sampleRun,
        status: "waiting_for_user",
        events: [
          ...sampleRun.events,
          {
            id: "event-agenda-late",
            runId: "run-release",
            kind: "round_agenda",
            agentId: "agent-coordinator",
            title: "Late round agenda",
            content: "Capture the delayed validation notes.",
            status: "completed",
            toolName: null,
            toolCallId: null,
            toolTarget: null,
            sequence: 2,
            createdAt: "2026-03-11T12:18:00Z",
          },
          {
            id: "event-file-late",
            runId: "run-release",
            kind: "file_change",
            agentId: "agent-coordinator",
            title: "Round 2",
            content: "agenda.md",
            status: "created",
            toolName: "session_artifacts",
            toolCallId: "round-02",
            toolTarget: "/tmp/team-runs/run-release/round-02/agenda.md",
            sequence: 3,
            createdAt: "2026-03-11T12:19:00Z",
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
        "Follow-up",
        "Capture the delayed validation notes.",
      );
      await clickButton(view.container, "Continue Run");

      expect(findText(view.container, "Late round agenda")).toBeFalsy();

      await act(async () => {
        vi.advanceTimersByTime(1600);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(findText(view.container, "Late round agenda")).toBeTruthy();

      await clickButton(view.container, "Files");
      expect(findText(view.container, "agenda.md")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps polling team-run detail while continue run is still pending so live round updates surface", async () => {
    vi.useFakeTimers();

    let resolveContinueRun: (run: TeamRunRecord) => void = () => {};

    try {
      const waitingRun = {
        ...sampleRun,
        status: "waiting_for_user",
      } as TeamRunRecord;
      const pendingContinueRun = new Promise<TeamRunRecord>((resolve) => {
        resolveContinueRun = resolve;
      });

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
        run: waitingRun,
      });
      continueTeamRunMock.mockImplementationOnce(
        async () => pendingContinueRun,
      );
      loadTeamRunMock.mockResolvedValueOnce({
        ...waitingRun,
        events: [
          ...waitingRun.events,
          {
            id: "event-agenda-pending",
            runId: "run-release",
            kind: "round_agenda",
            agentId: "agent-coordinator",
            title: "Late round agenda",
            content: "Surface live updates before continue resolves.",
            status: "completed",
            toolName: null,
            toolCallId: null,
            toolTarget: null,
            sequence: 2,
            createdAt: "2026-03-11T12:18:00Z",
          },
          {
            id: "event-file-pending",
            runId: "run-release",
            kind: "file_change",
            agentId: "agent-coordinator",
            title: "Round 2",
            content: "checkpoint.md",
            status: "created",
            toolName: "session_artifacts",
            toolCallId: "round-02",
            toolTarget: "/tmp/team-runs/run-release/round-02/checkpoint.md",
            sequence: 3,
            createdAt: "2026-03-11T12:19:00Z",
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
        "Follow-up",
        "Surface live updates before continue resolves.",
      );
      await clickButton(view.container, "Continue Run");

      expect(findText(view.container, "Late round agenda")).toBeFalsy();

      await act(async () => {
        vi.advanceTimersByTime(1600);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(findText(view.container, "Late round agenda")).toBeTruthy();

      await clickButton(view.container, "Files");
      expect(findText(view.container, "checkpoint.md")).toBeTruthy();
    } finally {
      resolveContinueRun({
        ...sampleRun,
        status: "waiting_for_user",
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      vi.useRealTimers();
    }
  });

  it("shows the run queue and retries a blocked run from chat", async () => {
    window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "zh-CN");
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

    expect(findText(view.container, "运行队列")).toBeTruthy();
    expect(findText(view.container, "Queued Ops Run")).toBeTruthy();
    expect(findText(view.container, "重试运行")).toBeTruthy();

    await clickButton(view.container, "重试运行");

    expect(retryTeamRunMock).toHaveBeenCalledWith("run-release");
    expect(findText(view.container, "已恢复")).toBeTruthy();
    expect(findText(view.container, "Run resumed")).toBeFalsy();
  });

  it("shows resume controls when a run is projected as stuck", async () => {
    window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "zh-CN");
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

    expect(findText(view.container, "恢复运行")).toBeTruthy();

    await clickButton(view.container, "恢复运行");

    expect(resumeTeamRunMock).toHaveBeenCalledWith("run-release");
    expect(findText(view.container, "已恢复")).toBeTruthy();
    expect(findText(view.container, "Run resumed")).toBeFalsy();
  });

  it("switches into conversation state after a direct send without rendering an inspector", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await setComposerValue(view.container, "Summarize today's notes");
    await clickButton(view.container, "Send");

    expect(routeWorldPromptStreamMock).toHaveBeenCalledWith(
      "Summarize today's notes",
      expect.any(Object),
      undefined,
      undefined,
    );
    expect(
      view.container.querySelector('[aria-label="Chat conversation surface"]'),
    ).toBeTruthy();
    expect(findText(view.container, "Context Inspector")).toBeFalsy();
    expect(findText(view.container, "Summarize today's notes")).toBeTruthy();
    expect(
      view.container.querySelector('[aria-label="Suggested next steps"]'),
    ).toBeFalsy();
  });

  it("renders assistant content progressively while a direct reply streams", async () => {
    const pendingStream = deferredValue<RouteWorldPromptMockResult>();
    routeWorldPromptStreamMock.mockImplementationOnce(
      async (prompt, handlers, sessionId, routing) => {
        const response = await routeWorldPromptMock(prompt, sessionId, routing);
        handlers.onStarted?.({
          session: response.session,
          provider: response.provider,
          routing: response.routing,
        });
        handlers.onDelta?.({ content: "已切换" });
        await Promise.resolve();
        handlers.onDelta?.({ content: "到流式输出" });
        return pendingStream.promise;
      },
    );

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await setComposerValue(view.container, "请切到流式输出");
    await clickButton(view.container, "Send");

    expect(findText(view.container, "请切到流式输出")).toBeTruthy();
    expect(findText(view.container, "已切换")).toBeTruthy();
    expect(findText(view.container, "已切换到流式输出")).toBeTruthy();

    await act(async () => {
      pendingStream.resolve({
        session: {
          id: "session-stream",
          title: "请切到流式输出",
          providerId: "provider-local",
          messageCount: 2,
          routing: null,
        },
        messages: [
          {
            id: "message-user-stream-final",
            role: "user",
            content: "请切到流式输出",
          },
          {
            id: "message-assistant-stream-final",
            role: "assistant",
            content: "已切换到流式输出",
          },
        ],
        provider: {
          id: "provider-local",
          name: "Local",
          model: "gpt-oss",
          baseUrl: "http://localhost:11434/v1",
        },
        output: "已切换到流式输出",
        exitStatus: "completed",
        routing: null,
        context: {
          attachedAgents: [],
          attachedKnowledgeLibraries: [],
        },
      });
      await pendingStream.promise;
    });

    expect(findText(view.container, "已切换到流式输出")).toBeTruthy();
  });

  it("renders localized direct transcript labels under zh-CN", async () => {
    window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "zh-CN");
    routeWorldPromptMock.mockResolvedValueOnce({
      session: {
        id: "session-zh-direct",
        title: "中文标签",
        providerId: "provider-local",
        messageCount: 2,
        routing: null,
      },
      messages: [
        {
          id: "message-zh-user",
          role: "user",
          content: "用一句中文回复：已连接。",
        },
        {
          id: "message-zh-assistant",
          role: "assistant",
          content: "已连接。",
        },
      ],
      provider: {
        id: "provider-local",
        name: "Local",
        model: "gpt-oss",
        baseUrl: "http://localhost:11434/v1",
      },
      output: "已连接。",
      exitStatus: "completed",
      routing: null,
      context: {
        attachedAgents: [],
        attachedKnowledgeLibraries: [],
      },
    });

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await setComposerValue(view.container, "用一句中文回复：已连接。");
    await clickButton(view.container, "Send");

    expect(findText(view.container, "你")).toBeTruthy();
    expect(findText(view.container, "助手")).toBeTruthy();
    expect(findText(view.container, "You")).toBeFalsy();
    expect(findText(view.container, "Assistant")).toBeFalsy();
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

    expect(listPendingMemoryCandidatesMock).toHaveBeenCalledWith(
      "chat",
      "session-123",
    );
    expect(
      view.container.querySelector('[data-testid="memory-review-toggle"]'),
    ).toBeFalsy();
    expect(
      view.container.querySelector('[data-testid="memory-review-panel"]'),
    ).toBeFalsy();
    expect(
      view.container.querySelector('[data-testid="memory-review-inline"]'),
    ).toBeTruthy();
    expect(
      view.container
        .querySelector(".chat-feed__stack")
        ?.contains(
          view.container.querySelector(
            '[data-testid="memory-review-inline"]',
          ) ?? null,
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
    expect(
      findText(view.container, "Chat turn proposed for review"),
    ).toBeFalsy();
    expect(findText(view.container, "应用审核")).toBeFalsy();
    expect(findText(view.container, "Schema schema-release")).toBeFalsy();

    await clickButton(view.container, "留存短期");

    expect(reviewMemoryCandidateMock).toHaveBeenCalledWith(
      "candidate-chat-1",
      "keep_episodic",
    );
  });

  it("localizes canned memory review reasons under zh-CN", async () => {
    window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "zh-CN");
    listPendingMemoryCandidatesMock.mockResolvedValueOnce([
      {
        id: "candidate-chat-2",
        nodeId: "node-chat-2",
        title: "连接确认",
        surface: "chat",
        ownerId: "session-123",
        suggestedSchemaId: "schema-chat",
        confidence: 0.76,
        reason: "Chat turn proposed for review",
        evidenceCount: 1,
        body: "详细记录：用一句中文回复：已连接。\n记录缘由：Chat turn proposed for review",
        relatedTitles: [],
      } as MemoryCandidate,
    ]);

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await setComposerValue(view.container, "用一句中文回复：已连接。");
    await clickButton(view.container, "Send");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      findText(view.container, "记录缘由：这条对话已进入记忆审核队列"),
    ).toBeTruthy();
    expect(
      findText(view.container, "记录缘由：Chat turn proposed for review"),
    ).toBeFalsy();
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

    expect(routeWorldPromptStreamMock).toHaveBeenCalledTimes(2);

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

    await setComposerValue(
      view.container,
      "Continue this branch with exactly: BRANCH OK",
    );
    await clickButton(view.container, "Send");

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(routeWorldPromptStreamMock).toHaveBeenCalledWith(
      "Continue this branch with exactly: BRANCH OK",
      expect.any(Object),
      "session-branch-1",
      undefined,
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
    await setSelectValue(
      view.container,
      "Session provider",
      "provider-fallback",
    );
    await setFieldValue(view.container, "Session model", "gpt-4.1-mini");
    await setComposerValue(view.container, "Route this directly");
    await clickButton(view.container, "Send");

    expect(routeWorldPromptStreamMock).toHaveBeenCalledWith(
      "Route this directly",
      expect.any(Object),
      undefined,
      {
        requestedProviderId: "provider-fallback",
        requestedModel: "gpt-4.1-mini",
      },
    );

    const routeButton = view.container.querySelector(
      '[aria-label="Configure session route"]',
    ) as HTMLButtonElement | null;

    expect(
      view.container.querySelector('[data-testid="chat-routing-state"]'),
    ).toBeFalsy();
    expect(routeButton?.textContent).toContain("Fallback");
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
    const controls = view.container.querySelector(
      '[data-testid="chat-composer-controls"]',
    );
    const utilities = view.container.querySelector(".composer__utilities");
    const submit = view.container.querySelector(".composer__submit");

    expect(
      view.container.querySelector('[aria-label="Suggested next steps"]'),
    ).toBeFalsy();
    expect(view.container.querySelector(".chat-route-card")).toBeFalsy();
    expect(view.container.querySelector(".composer__footer")).toBeFalsy();
    expect(controls).toBeTruthy();
    expect(routeButton && utilities?.contains(routeButton)).toBe(true);
    expect(draftButton && utilities?.contains(draftButton)).toBe(true);
    expect(sendButton && submit?.contains(sendButton)).toBe(true);
    expect(routeButton?.textContent).toContain("Local");
    expect(routeButton?.textContent).toContain("gpt-oss");
    expect(routeButton?.textContent).not.toContain("Desktop default");
    expect(draftButton?.className).toContain("composer__icon-action");
    expect(sendButton?.className).toContain("composer__send--circle");
    expect(sendButton?.textContent?.trim()).toBe("");
    expect(tabList?.className).toContain("session-tabs--scrollable");
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

    expect(startTeamRunMock).toHaveBeenCalledWith(
      "team-release",
      {
        requestedProviderId: "provider-broken",
        requestedModel: null,
      },
      "Kick off the release",
    );
    expect(continueTeamRunMock).not.toHaveBeenCalled();

    expect(
      view.container.querySelector('[data-testid="team-run-routing-state"]'),
    ).toBeFalsy();
    expect(view.container.querySelector(".chat-route-card")).toBeFalsy();
  });
});
