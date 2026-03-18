import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { NukaLockup } from "@/components/brand/NukaLockup";
import {
  routeWorldPromptStream,
  type ChatMessage,
  type ChatProviderInfo,
  type ChatRouteResponse,
  type ProviderRoutingRequest,
  type ProviderRoutingState,
} from "@/lib/chat";
import { MemoryReviewDock } from "@/components/memory/MemoryReviewDock";
import { useI18n } from "@/lib/i18n";
import { listProviders, type ProviderRecord } from "@/lib/providers";
import { emitToast } from "@/lib/toast";
import { useProviderGate } from "@/hooks/useProviderGate";
import { useMemoryReviewDock } from "@/hooks/useMemoryReviewDock";
import { useWorkspaceSessions } from "@/hooks/useWorkspaceSessions";
import {
  addTeamRunAgent,
  continueTeamRun,
  createTeamFromGoal,
  listTeams,
  loadTeamRun,
  resumeTeamRun,
  retryTeamRun,
  startTeamRun,
  type TeamRecord,
  type TeamRunRecord,
} from "@/lib/team";
import { branchWorkspaceSession } from "@/lib/workspace";
import { ConversationEventBlock } from "./ConversationEventBlock";
import { SessionTabs } from "./SessionTabs";
import { TeamRunPanel, type TeamRunPanelAgentDraft } from "./TeamRunPanel";

const CHAT_ONLY_SUGGESTIONS = [
  "Summarize today's notes",
  "Plan my next team",
  "Review recent changes",
];

const CREATE_TEAM_SUGGESTIONS = [
  "Outline the team goal",
  "List the needed roles",
  "Define the success criteria",
];

const CHOOSE_TEAM_SUGGESTIONS = [
  "Kick off the run",
  "Highlight the biggest risk",
  "List the first checkpoint",
];

type ComposerEntryMode = "direct" | "choose_team" | "create_team";

const META_SEPARATOR = " · ";
const SESSION_ELLIPSIS = "…";
const TEAM_RUN_QUEUE_STATUSES = new Set([
  "queued",
  "running",
  "blocked",
  "stuck",
]);
const TEAM_RUN_LIVE_REFRESH_STATUSES = new Set(["queued", "running", "active"]);
const TEAM_RUN_POST_ACTION_REFRESH_TICKS = 8;

type ProviderRouteDraft = {
  requestedProviderId: string;
  requestedModel: string;
};

type DirectStreamingPreview = {
  sessionId: string | null;
  userMessage: ChatMessage;
  assistantMessageId: string;
  assistantChunks: string[];
};

function formatSession(sessionId: string | undefined) {
  if (!sessionId) {
    return "Pending";
  }

  return `${sessionId.slice(0, 8)}${sessionId.length > 8 ? SESSION_ELLIPSIS : ""}`;
}

function workspaceSessionKey(
  sessionId: string,
  kind: "direct_chat" | "team_run",
) {
  return `${kind}:${sessionId}`;
}

function suggestionsForMode(entryMode: ComposerEntryMode) {
  switch (entryMode) {
    case "create_team":
      return CREATE_TEAM_SUGGESTIONS;
    case "choose_team":
      return CHOOSE_TEAM_SUGGESTIONS;
    case "direct":
    default:
      return CHAT_ONLY_SUGGESTIONS;
  }
}

function entrySummary(
  entryMode: ComposerEntryMode,
  selectedTeam: TeamRecord | null,
  labels: {
    chooseTeam: string;
    createTeam: string;
    direct: string;
  },
) {
  switch (entryMode) {
    case "create_team":
      return labels.createTeam;
    case "choose_team":
      return selectedTeam ? selectedTeam.name : labels.chooseTeam;
    case "direct":
    default:
      return labels.direct;
  }
}

function composerPlaceholder(
  landing: boolean,
  entryMode: ComposerEntryMode,
  labels: {
    createTeam: string;
    direct: string;
    reply: string;
  },
) {
  if (!landing) {
    return labels.reply;
  }

  switch (entryMode) {
    case "create_team":
      return labels.createTeam;
    case "choose_team":
      return "";
    case "direct":
    default:
      return labels.direct;
  }
}

function buildRoutingRequest(
  routeDraft: ProviderRouteDraft,
): ProviderRoutingRequest | undefined {
  const requestedProviderId = routeDraft.requestedProviderId.trim() || null;
  const requestedModel = routeDraft.requestedModel.trim() || null;

  if (!requestedProviderId && !requestedModel) {
    return undefined;
  }

  return {
    requestedProviderId,
    requestedModel,
  };
}

function routeDraftFromState(
  routing: ProviderRoutingState | null,
): ProviderRouteDraft {
  return {
    requestedProviderId: routing?.requestedProviderId ?? "",
    requestedModel: routing?.requestedModel ?? "",
  };
}

function formatRouteSummary(
  providerLabel: string | null,
  modelLabel: string | null,
) {
  const parts = [providerLabel?.trim(), modelLabel?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Desktop default";
}

function formatRunStatus(status: string, t: ReturnType<typeof useI18n>["t"]) {
  if (status === "waiting_for_user") {
    return t("teamRun.state.waitingForInput");
  }

  if (status === "queued") {
    return t("teamRun.state.queued");
  }

  if (status === "blocked") {
    return t("teamRun.state.blocked");
  }

  if (status === "stuck") {
    return t("teamRun.state.stuck");
  }

  if (status === "running" || status === "active") {
    return t("teamRun.state.running");
  }

  if (status === "completed" || status === "done") {
    return t("teamRun.state.completed");
  }

  return status.replace(/_/g, " ");
}

function toErrorMessage(caughtError: unknown) {
  return caughtError instanceof Error
    ? caughtError.message
    : String(caughtError);
}

function latestRunEvent(run: TeamRunRecord | null, kind: string) {
  if (!run) {
    return null;
  }

  return [...run.events].reverse().find((event) => event.kind === kind) ?? null;
}

function latestRunSequence(run: TeamRunRecord | null) {
  if (!run) {
    return 0;
  }

  return run.events.reduce(
    (highestSequence, event) =>
      event.sequence > highestSequence ? event.sequence : highestSequence,
    0,
  );
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return Number.NaN;
  }

  return Date.parse(value);
}

function pickPreferredTeamRun(
  current: TeamRunRecord | null,
  incoming: TeamRunRecord | null,
) {
  if (!incoming) {
    return incoming;
  }

  if (!current || current.id !== incoming.id) {
    return incoming;
  }

  const currentSequence = latestRunSequence(current);
  const incomingSequence = latestRunSequence(incoming);

  if (incomingSequence !== currentSequence) {
    return incomingSequence > currentSequence ? incoming : current;
  }

  const currentUpdatedAt = parseTimestamp(current.updatedAt);
  const incomingUpdatedAt = parseTimestamp(incoming.updatedAt);

  if (
    Number.isFinite(currentUpdatedAt) &&
    Number.isFinite(incomingUpdatedAt) &&
    incomingUpdatedAt !== currentUpdatedAt
  ) {
    return incomingUpdatedAt > currentUpdatedAt ? incoming : current;
  }

  if (incoming.agents.length !== current.agents.length) {
    return incoming.agents.length > current.agents.length ? incoming : current;
  }

  return incoming;
}

function resolveActiveTeamRunStatus(
  run: TeamRunRecord | null,
  summaryStatus: string | null,
) {
  if (summaryStatus === "blocked" || summaryStatus === "stuck") {
    return summaryStatus;
  }

  return run?.status ?? summaryStatus ?? null;
}

function ComposerPlusIcon() {
  return (
    <svg
      aria-hidden="true"
      className="composer__icon composer__icon--plus"
      viewBox="0 0 16 16"
    >
      <path d="M8 3.5v9" />
      <path d="M3.5 8h9" />
    </svg>
  );
}

function ComposerSendIcon() {
  return (
    <svg
      aria-hidden="true"
      className="composer__icon composer__icon--send"
      viewBox="0 0 16 16"
    >
      <path d="M8 12.5v-8" />
      <path d="M4.5 7.5 8 4l3.5 3.5" />
    </svg>
  );
}

function ComposerChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      className="composer__icon composer__icon--chevron"
      viewBox="0 0 16 16"
    >
      <path d="M4.5 6.5 8 10l3.5-3.5" />
    </svg>
  );
}

function ComposerNoteIcon() {
  return (
    <svg
      aria-hidden="true"
      className="composer__icon composer__icon--note"
      viewBox="0 0 16 16"
    >
      <path d="M4.5 2.5h5.5l2.5 2.5v8H4.5z" />
      <path d="M10 2.5v3h3" />
      <path d="M6.5 8h4" />
      <path d="M6.5 10.5h3" />
    </svg>
  );
}

function ComposerCloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="composer__icon composer__icon--close"
      viewBox="0 0 16 16"
    >
      <path d="M4 4l8 8M12 4 4 12" />
    </svg>
  );
}

export function ChatPage() {
  const { t } = useI18n();
  const providerGate = useProviderGate();
  const workspaceSessions = useWorkspaceSessions();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [session, setSession] = useState<ChatRouteResponse | null>(null);
  const [sessionProvider, setSessionProvider] =
    useState<ChatProviderInfo | null>(null);
  const [entryMode, setEntryMode] = useState<ComposerEntryMode>("direct");
  const [entryMenuOpen, setEntryMenuOpen] = useState(false);
  const [routeMenuOpen, setRouteMenuOpen] = useState(false);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<TeamRecord[]>([]);
  const [availableProviders, setAvailableProviders] = useState<
    ProviderRecord[]
  >([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [routeDraft, setRouteDraft] = useState<ProviderRouteDraft>({
    requestedProviderId: "",
    requestedModel: "",
  });
  const [directStreamingPreview, setDirectStreamingPreview] =
    useState<DirectStreamingPreview | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [teamRunState, setTeamRunState] = useState<TeamRunRecord | null>(null);
  const [teamRunRefreshBudget, setTeamRunRefreshBudget] = useState<{
    remaining: number;
    runId: string;
  } | null>(null);
  const [isTeamRunBusy, setIsTeamRunBusy] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [dismissedSessionKeys, setDismissedSessionKeys] = useState<string[]>(
    [],
  );
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const teamRunRefreshInFlightRef = useRef(false);
  const activeWorkspaceSessionId = workspaceSessions.activeSessionId;
  const activeDirectSession =
    workspaceSessions.activeSession?.kind === "direct_chat"
      ? workspaceSessions.activeSession
      : null;
  const workspaceTeamRun =
    workspaceSessions.activeSession?.kind === "team_run"
      ? workspaceSessions.activeSession.run
      : null;
  const localDirectSession =
    !activeWorkspaceSessionId ||
    session?.session.id === activeWorkspaceSessionId
      ? session
      : null;
  const localDirectMessages = localDirectSession ? messages : [];
  const baseDirectMessages =
    activeDirectSession?.messages ?? localDirectMessages;
  const directPreviewMatchesActiveSession =
    directStreamingPreview !== null &&
    (!activeWorkspaceSessionId ||
      directStreamingPreview.sessionId === null ||
      directStreamingPreview.sessionId === activeWorkspaceSessionId);
  const directPreviewMessages = directStreamingPreview
    ? [
        directStreamingPreview.userMessage,
        {
          id: directStreamingPreview.assistantMessageId,
          role: "assistant" as const,
          content: directStreamingPreview.assistantChunks.join(""),
        },
      ]
    : [];
  const activeTeamRun =
    teamRunState && teamRunState.id === activeWorkspaceSessionId
      ? teamRunState
      : workspaceTeamRun;
  const activeTeamRunSummary =
    activeTeamRun && workspaceSessions.activeSummary?.kind === "team_run"
      ? workspaceSessions.activeSummary
      : null;
  const activeSessionRecord =
    activeDirectSession?.session ?? localDirectSession?.session ?? null;
  const activeMessages =
    !activeTeamRun && directPreviewMatchesActiveSession
      ? [...baseDirectMessages, ...directPreviewMessages]
      : baseDirectMessages;
  const activeRouting =
    activeTeamRun?.routing ?? activeSessionRecord?.routing ?? null;
  const activeSessionProvider =
    sessionProvider && session?.session.id === activeSessionRecord?.id
      ? sessionProvider
      : null;
  const activeTeamRunStatus = resolveActiveTeamRunStatus(
    activeTeamRun,
    activeTeamRunSummary?.status ?? null,
  );
  const activeTeamRunRefreshBudget =
    activeTeamRun && teamRunRefreshBudget?.runId === activeTeamRun.id
      ? teamRunRefreshBudget.remaining
      : 0;
  const activeBlockedEvent = latestRunEvent(activeTeamRun, "run_blocked");
  const sessionSwitchPending =
    !!activeWorkspaceSessionId &&
    !workspaceSessions.activeSession &&
    !activeTeamRun &&
    !localDirectSession;
  const selectedTeam = useMemo(
    () => availableTeams.find((team) => team.id === selectedTeamId) ?? null,
    [availableTeams, selectedTeamId],
  );
  const visibleSessions = useMemo(() => {
    const sessions = [...workspaceSessions.sessions];

    if (
      activeSessionRecord &&
      !sessions.some(
        (workspaceSession) =>
          workspaceSession.id === activeSessionRecord.id &&
          workspaceSession.kind === "direct_chat",
      )
    ) {
      sessions.unshift({
        id: activeSessionRecord.id,
        kind: "direct_chat",
        title: activeSessionRecord.title,
        status: "active",
        updatedAt: new Date().toISOString(),
      });
    }

    if (
      activeTeamRun &&
      !sessions.some(
        (workspaceSession) =>
          workspaceSession.id === activeTeamRun.id &&
          workspaceSession.kind === "team_run",
      )
    ) {
      sessions.unshift({
        id: activeTeamRun.id,
        kind: "team_run",
        title: activeTeamRun.title,
        status: activeTeamRunSummary?.status ?? activeTeamRun.status,
        updatedAt: activeTeamRun.updatedAt,
      });
    }

    const dismissed = new Set(dismissedSessionKeys);

    return sessions.filter(
      (workspaceSession) =>
        !dismissed.has(
          workspaceSessionKey(workspaceSession.id, workspaceSession.kind),
        ),
    );
  }, [
    activeSessionRecord,
    activeTeamRun,
    activeTeamRunSummary?.status,
    dismissedSessionKeys,
    workspaceSessions.sessions,
  ]);
  const queuedTeamRuns = useMemo(
    () =>
      workspaceSessions.sessions.filter(
        (session) =>
          session.kind === "team_run" &&
          TEAM_RUN_QUEUE_STATUSES.has(session.status),
      ),
    [workspaceSessions.sessions],
  );
  const memoryReviewDock = useMemoryReviewDock(
    "chat",
    activeDirectSession?.session.id ?? session?.session.id ?? null,
    activeDirectSession?.session.messageCount ??
      session?.session.messageCount ??
      null,
  );

  const landing =
    activeMessages.length === 0 &&
    visibleSessions.length === 0 &&
    !activeTeamRun;
  const showTeamChooser = entryMode === "choose_team";
  const showCreateTeamPill = entryMode === "create_team";

  useEffect(() => {
    let alive = true;

    void listTeams()
      .then((teams) => {
        if (!alive) {
          return;
        }

        setAvailableTeams(Array.isArray(teams) ? teams : []);
      })
      .catch(() => {
        if (!alive) {
          return;
        }

        setAvailableTeams([]);
      });

    void listProviders()
      .then((providers) => {
        if (!alive) {
          return;
        }

        setAvailableProviders(Array.isArray(providers) ? providers : []);
      })
      .catch(() => {
        if (!alive) {
          return;
        }

        setAvailableProviders([]);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setTeamRunState((current) =>
      pickPreferredTeamRun(current, workspaceTeamRun),
    );
  }, [workspaceTeamRun]);

  useEffect(() => {
    setRouteDraft(routeDraftFromState(activeRouting));
  }, [
    activeRouting,
    activeDirectSession?.session.id,
    activeTeamRun?.id,
    session?.session.id,
  ]);

  useEffect(() => {
    teamRunRefreshInFlightRef.current = false;
  }, [activeTeamRun?.id]);

  useEffect(() => {
    if (
      !activeTeamRun ||
      (!TEAM_RUN_LIVE_REFRESH_STATUSES.has(activeTeamRun.status) &&
        activeTeamRunRefreshBudget <= 0)
    ) {
      return;
    }

    const selection = {
      id: activeTeamRun.id,
      kind: "team_run" as const,
    };
    const intervalId = window.setInterval(() => {
      if (teamRunRefreshInFlightRef.current) {
        return;
      }

      teamRunRefreshInFlightRef.current = true;
      void (async () => {
        try {
          const refreshedRun = await loadTeamRun(activeTeamRun.id);
          if (refreshedRun) {
            setTeamRunState((current) =>
              pickPreferredTeamRun(current, refreshedRun),
            );
          }
          await workspaceSessions.refresh(selection);
          if (activeTeamRunRefreshBudget > 0) {
            setTeamRunRefreshBudget((current) =>
              current && current.runId === activeTeamRun.id
                ? current.remaining > 1
                  ? {
                      remaining: current.remaining - 1,
                      runId: current.runId,
                    }
                  : null
                : current,
            );
          }
        } finally {
          teamRunRefreshInFlightRef.current = false;
        }
      })();
    }, 1500);

    return () => {
      window.clearInterval(intervalId);
      teamRunRefreshInFlightRef.current = false;
    };
  }, [
    activeTeamRun?.id,
    activeTeamRun?.status,
    activeTeamRunRefreshBudget,
    workspaceSessions,
  ]);

  const handleEntryModeSelect = (nextMode: ComposerEntryMode) => {
    setEntryMode(nextMode);
    setEntryMenuOpen(false);
    setRouteMenuOpen(false);

    if (nextMode === "choose_team") {
      setTeamPickerOpen(true);
      return;
    }

    setSelectedTeamId("");
    setTeamPickerOpen(false);
  };

  const handleSessionSelect = (sessionId: string) => {
    workspaceSessions.setActiveSessionId(sessionId);
    setEntryMenuOpen(false);
    setRouteMenuOpen(false);
    setTeamPickerOpen(false);
    setSelectedTeamId("");
    setEntryMode("direct");
  };

  const handleSessionClose = (
    sessionId: string,
    kind: "direct_chat" | "team_run",
  ) => {
    const closingKey = workspaceSessionKey(sessionId, kind);
    const remaining = visibleSessions.filter(
      (workspaceSession) =>
        workspaceSessionKey(workspaceSession.id, workspaceSession.kind) !==
        closingKey,
    );
    const activeKey = activeTeamRun
      ? workspaceSessionKey(activeTeamRun.id, "team_run")
      : activeSessionRecord
        ? workspaceSessionKey(activeSessionRecord.id, "direct_chat")
        : null;

    setDismissedSessionKeys((current) =>
      current.includes(closingKey) ? current : [...current, closingKey],
    );

    if (activeKey !== closingKey) {
      return;
    }

    const nextSession = remaining[0] ?? null;

    if (nextSession) {
      handleSessionSelect(nextSession.id);
      return;
    }

    workspaceSessions.setActiveSessionId(null);
    setMessages([]);
    setSession(null);
    setSessionProvider(null);
    setTeamRunState(null);
  };

  const handleSend = async (nextPrompt?: string) => {
    if (isRouting) {
      return;
    }

    if (!providerGate.ready) {
      emitToast({
        message: providerGate.blocked
          ? t("chat.toast.providerRequired")
          : providerGate.message,
        tone: "error",
      });
      return;
    }

    const value = (nextPrompt ?? prompt).trim();
    if (!value) {
      return;
    }

    if (entryMode === "choose_team" && !selectedTeamId.trim()) {
      emitToast({
        message: t("chat.toast.teamRequired"),
        tone: "error",
      });
      return;
    }

    setPrompt("");
    setEntryMenuOpen(false);
    setRouteMenuOpen(false);
    setTeamPickerOpen(false);
    setIsRouting(true);
    const routingRequest = buildRoutingRequest(routeDraft);

    try {
      if (entryMode === "create_team") {
        const created = await createTeamFromGoal(value);
        setAvailableTeams((current) => {
          const existingIndex = current.findIndex(
            (team) => team.id === created.id,
          );
          if (existingIndex === -1) {
            return [...current, created];
          }

          return current.map((team, index) =>
            index === existingIndex ? created : team,
          );
        });
        setSelectedTeamId(created.id);
        setEntryMode("direct");
        emitToast({
          message: t("chat.toast.teamCreated", { value: created.name }),
          tone: "success",
        });
        return;
      }

      if (entryMode === "choose_team") {
        const run = routingRequest
          ? await startTeamRun(selectedTeamId.trim(), routingRequest, value)
          : await startTeamRun(selectedTeamId.trim(), undefined, value);
        setTeamRunState(run);
        setTeamRunRefreshBudget({
          remaining: TEAM_RUN_POST_ACTION_REFRESH_TICKS,
          runId: run.id,
        });
        setSelectedTeamId("");
        setEntryMode("direct");
        await workspaceSessions.refresh({
          id: run.id,
          kind: "team_run",
        });
        return;
      }

      const userMessage: ChatMessage = {
        id: globalThis.crypto?.randomUUID?.() ?? `chat-user-${Date.now()}`,
        role: "user",
        content: value,
      };
      const assistantPreviewMessage: ChatMessage = {
        id:
          globalThis.crypto?.randomUUID?.() ??
          `chat-assistant-preview-${Date.now()}`,
        role: "assistant",
        content: "",
      };

      setDirectStreamingPreview({
        sessionId: activeSessionRecord?.id ?? null,
        userMessage,
        assistantMessageId: assistantPreviewMessage.id,
        assistantChunks: [],
      });

      const response = await routeWorldPromptStream(
        value,
        {
          onStarted: (event) => {
            setSession((current) => ({
              session: event.session,
              messages: current?.messages ?? [],
              provider: event.provider,
              routing: event.routing,
              context: current?.context ?? {
                attachedAgents: [],
                attachedKnowledgeLibraries: [],
              },
            }));
            setSessionProvider(event.provider);
            setDirectStreamingPreview((current) =>
              current
                ? {
                    ...current,
                    sessionId: event.session.id,
                  }
                : current,
            );
          },
          onDelta: (event) => {
            setDirectStreamingPreview((current) => {
              if (!current) {
                return current;
              }

              return {
                ...current,
                assistantChunks: [...current.assistantChunks, event.content],
              };
            });
          },
        },
        activeSessionRecord?.id,
        routingRequest,
      );
      setMessages((current) =>
        activeSessionRecord?.id === response.session.id
          ? current
          : [...current, ...response.messages],
      );
      setSession(response);
      setSessionProvider(response.provider);
      setDirectStreamingPreview(null);
      void workspaceSessions.refresh({
        id: response.session.id,
        kind: "direct_chat",
      });
    } catch (caughtError) {
      setDirectStreamingPreview(null);
      emitToast({
        message: toErrorMessage(caughtError),
        tone: "error",
      });
    } finally {
      setIsRouting(false);
    }
  };

  const handleContinueTeamRun = async (nextPrompt: string) => {
    if (!activeTeamRun || isTeamRunBusy) {
      return;
    }

    setIsTeamRunBusy(true);
    setTeamRunRefreshBudget({
      remaining: TEAM_RUN_POST_ACTION_REFRESH_TICKS,
      runId: activeTeamRun.id,
    });
    const routingRequest = buildRoutingRequest(routeDraft);

    try {
      const updated = routingRequest
        ? await continueTeamRun(activeTeamRun.id, nextPrompt, routingRequest)
        : await continueTeamRun(activeTeamRun.id, nextPrompt);
      setTeamRunState(updated);
      setTeamRunRefreshBudget({
        remaining: TEAM_RUN_POST_ACTION_REFRESH_TICKS,
        runId: updated.id,
      });
      await workspaceSessions.refresh({
        id: updated.id,
        kind: "team_run",
      });
    } catch (caughtError) {
      emitToast({
        message: toErrorMessage(caughtError),
        tone: "error",
      });
    } finally {
      setIsTeamRunBusy(false);
    }
  };

  const handleAddTeamRunAgent = async (agent: TeamRunPanelAgentDraft) => {
    if (!activeTeamRun || isTeamRunBusy) {
      return;
    }

    setIsTeamRunBusy(true);
    setTeamRunRefreshBudget({
      remaining: TEAM_RUN_POST_ACTION_REFRESH_TICKS,
      runId: activeTeamRun.id,
    });

    try {
      const updated = await addTeamRunAgent(activeTeamRun.id, {
        name: agent.name,
        role: agent.role,
        responsibility: agent.responsibility,
        systemPrompt: `Join as ${agent.role} and focus on ${agent.responsibility}.`,
        toolBindings: [],
        toolUsePolicy: {
          maxCallsPerRound: 1,
          summarizeOutput: true,
        },
        joinReason: agent.responsibility,
      });
      setTeamRunState(updated);
      setTeamRunRefreshBudget({
        remaining: TEAM_RUN_POST_ACTION_REFRESH_TICKS,
        runId: updated.id,
      });
      await workspaceSessions.refresh({
        id: updated.id,
        kind: "team_run",
      });
    } catch (caughtError) {
      emitToast({
        message: toErrorMessage(caughtError),
        tone: "error",
      });
    } finally {
      setIsTeamRunBusy(false);
    }
  };

  const handleRetryTeamRun = async () => {
    if (!activeTeamRun || isTeamRunBusy) {
      return;
    }

    setIsTeamRunBusy(true);
    setTeamRunRefreshBudget({
      remaining: TEAM_RUN_POST_ACTION_REFRESH_TICKS,
      runId: activeTeamRun.id,
    });

    try {
      const updated = await retryTeamRun(activeTeamRun.id);
      setTeamRunState(updated);
      setTeamRunRefreshBudget({
        remaining: TEAM_RUN_POST_ACTION_REFRESH_TICKS,
        runId: updated.id,
      });
      await workspaceSessions.refresh({
        id: updated.id,
        kind: "team_run",
      });
    } catch (caughtError) {
      emitToast({
        message: toErrorMessage(caughtError),
        tone: "error",
      });
    } finally {
      setIsTeamRunBusy(false);
    }
  };

  const handleResumeTeamRun = async () => {
    if (!activeTeamRun || isTeamRunBusy) {
      return;
    }

    setIsTeamRunBusy(true);
    setTeamRunRefreshBudget({
      remaining: TEAM_RUN_POST_ACTION_REFRESH_TICKS,
      runId: activeTeamRun.id,
    });

    try {
      const updated = await resumeTeamRun(activeTeamRun.id);
      setTeamRunState(updated);
      setTeamRunRefreshBudget({
        remaining: TEAM_RUN_POST_ACTION_REFRESH_TICKS,
        runId: updated.id,
      });
      await workspaceSessions.refresh({
        id: updated.id,
        kind: "team_run",
      });
    } catch (caughtError) {
      emitToast({
        message: toErrorMessage(caughtError),
        tone: "error",
      });
    } finally {
      setIsTeamRunBusy(false);
    }
  };

  const handleOpenExternalDraft = async () => {
    if (isDrafting) {
      return;
    }

    setEntryMenuOpen(false);
    setRouteMenuOpen(false);
    setIsDrafting(true);

    try {
      const drafted = await invoke<string>("open_external_prompt_draft", {
        initialContent: prompt,
      });
      setPrompt(drafted);
      emitToast({
        message: "Draft loaded from editor.",
        tone: "success",
      });
    } catch (caughtError) {
      emitToast({
        message: toErrorMessage(caughtError),
        tone: "error",
      });
    } finally {
      setIsDrafting(false);
    }
  };

  const handleBranchDirectChat = async (messageId: string) => {
    if (!activeSessionRecord || isRouting) {
      return;
    }

    setIsRouting(true);

    try {
      const branched = await branchWorkspaceSession(
        activeSessionRecord.id,
        "direct_chat",
        messageId,
      );
      await workspaceSessions.refresh({
        id: branched.id,
        kind: branched.kind,
      });
    } catch (caughtError) {
      emitToast({
        message: toErrorMessage(caughtError),
        tone: "error",
      });
    } finally {
      setIsRouting(false);
    }
  };

  const handleBranchTeamRun = async (eventId: string) => {
    if (!activeTeamRun || isTeamRunBusy) {
      return;
    }

    setIsTeamRunBusy(true);

    try {
      const branched = await branchWorkspaceSession(
        activeTeamRun.id,
        "team_run",
        eventId,
      );
      await workspaceSessions.refresh({
        id: branched.id,
        kind: branched.kind,
      });
    } catch (caughtError) {
      emitToast({
        message: toErrorMessage(caughtError),
        tone: "error",
      });
    } finally {
      setIsTeamRunBusy(false);
    }
  };

  const activeDirectProviderRecord = activeSessionRecord?.providerId
    ? (availableProviders.find(
        (provider) => provider.id === activeSessionRecord.providerId,
      ) ?? null)
    : null;
  const activeTitlebar =
    !landing && !sessionSwitchPending && (activeTeamRun || activeSessionRecord)
      ? {
          kind: activeTeamRun
            ? t("chat.titlebar.team")
            : t("chat.titlebar.chat"),
          title:
            activeTeamRun?.title ??
            activeSessionRecord?.title ??
            entrySummary(entryMode, selectedTeam, {
              chooseTeam: t("chat.entry.chooseTeam"),
              createTeam: t("chat.entry.createTeam"),
              direct: t("chat.entry.direct"),
            }),
        }
      : null;
  const effectiveModelLabel =
    activeRouting?.effectiveModel ??
    activeSessionProvider?.model ??
    activeDirectProviderRecord?.model ??
    "";
  const effectiveProviderLabel =
    activeSessionProvider?.name ??
    (activeRouting?.effectiveProviderId
      ? (availableProviders.find(
          (provider) => provider.id === activeRouting.effectiveProviderId,
        )?.name ?? activeRouting.effectiveProviderId)
      : (activeDirectProviderRecord?.name ?? null));
  const requestedProviderLabel = routeDraft.requestedProviderId
    ? (availableProviders.find(
        (provider) => provider.id === routeDraft.requestedProviderId,
      )?.name ?? routeDraft.requestedProviderId)
    : null;
  const routeSummary =
    !activeTeamRun && (effectiveProviderLabel || effectiveModelLabel)
      ? formatRouteSummary(effectiveProviderLabel, effectiveModelLabel)
      : formatRouteSummary(
          requestedProviderLabel,
          routeDraft.requestedModel.trim() || null,
        );
  const routeControls = routeMenuOpen ? (
    <div className="composer__route-menu" data-testid="chat-route-controls">
      <label className="chat-route-field">
        <span className="chat-route-field__label">Route</span>
        <select
          aria-label="Session provider"
          className="chat-route-select chat-route-select--flat"
          onChange={(event) =>
            setRouteDraft((current) => ({
              ...current,
              requestedProviderId: event.target.value,
            }))
          }
          value={routeDraft.requestedProviderId}
        >
          <option value="">Desktop default</option>
          {availableProviders.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
      </label>

      <label className="chat-route-field">
        <span className="chat-route-field__label">Model</span>
        <input
          aria-label="Session model"
          className="chat-route-input"
          onChange={(event) =>
            setRouteDraft((current) => ({
              ...current,
              requestedModel: event.target.value,
            }))
          }
          placeholder="Desktop default"
          value={routeDraft.requestedModel}
        />
      </label>
    </div>
  ) : null;
  const runQueue =
    queuedTeamRuns.length > 0 ? (
      <section
        aria-label={t("chat.runQueue.title")}
        className="chat-run-queue ui-card"
      >
        <div className="chat-run-queue__header">
          <h2>{t("chat.runQueue.title")}</h2>
        </div>
        <div className="chat-run-queue__list">
          {queuedTeamRuns.map((sessionItem) => (
            <button
              className={`chat-run-queue__item${
                sessionItem.id === activeTeamRun?.id ? " is-active" : ""
              }`}
              key={sessionItem.id}
              onClick={() => handleSessionSelect(sessionItem.id)}
              type="button"
            >
              <span className="chat-run-queue__title">{sessionItem.title}</span>
              <span className="chat-run-queue__status">
                {formatRunStatus(sessionItem.status, t)}
              </span>
            </button>
          ))}
        </div>
      </section>
    ) : null;
  const recoveryPanel =
    activeTeamRun && activeTeamRunStatus === "blocked" ? (
      <section
        aria-label={t("chat.runRecovery.title")}
        className="chat-run-recovery ui-card"
      >
        <div className="chat-run-recovery__header">
          <span className="chat-run-recovery__eyebrow">
            {t("chat.runRecovery.title")}
          </span>
          <span className="chat-run-recovery__status">
            {t("teamRun.state.blocked")}
          </span>
        </div>
        <p className="chat-run-recovery__message">
          {activeBlockedEvent?.content ?? t("chat.runRecovery.message.blocked")}
        </p>
        <div className="chat-run-recovery__actions">
          <button
            className="settings-button settings-button--accent"
            disabled={isTeamRunBusy}
            onClick={() => {
              void handleRetryTeamRun();
            }}
            type="button"
          >
            {t("chat.runRecovery.retry")}
          </button>
        </div>
      </section>
    ) : activeTeamRun && activeTeamRunStatus === "stuck" ? (
      <section
        aria-label={t("chat.runRecovery.title")}
        className="chat-run-recovery ui-card"
      >
        <div className="chat-run-recovery__header">
          <span className="chat-run-recovery__eyebrow">
            {t("chat.runRecovery.title")}
          </span>
          <span className="chat-run-recovery__status">
            {t("teamRun.state.stuck")}
          </span>
        </div>
        <p className="chat-run-recovery__message">
          {t("chat.runRecovery.message.stuck")}
        </p>
        <div className="chat-run-recovery__actions">
          <button
            className="settings-button settings-button--accent"
            disabled={isTeamRunBusy}
            onClick={() => {
              void handleResumeTeamRun();
            }}
            type="button"
          >
            {t("chat.runRecovery.resume")}
          </button>
        </div>
      </section>
    ) : null;

  const composer = (
    <div
      aria-label="Chat composer"
      className={`composer composer--chat ${landing ? "composer--landing" : "composer--active"}`}
    >
      <div
        className={`composer__bar ${
          showTeamChooser || showCreateTeamPill ? "composer__bar--pill" : ""
        }`}
      >
        <div
          className="composer__field"
          onClick={() => {
            composerInputRef.current?.focus();
          }}
        >
          <textarea
            className="composer__input"
            disabled={isRouting}
            ref={composerInputRef}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={composerPlaceholder(landing, entryMode, {
              createTeam: t("chat.placeholder.createTeam"),
              direct: t("chat.placeholder.direct"),
              reply: t("chat.placeholder.reply"),
            })}
            rows={1}
            value={prompt}
          />
        </div>

        <div
          className="composer__controls"
          data-testid="chat-composer-controls"
        >
          <div className="composer__utilities">
            <div className="composer__menu">
              <button
                aria-expanded={entryMenuOpen}
                aria-haspopup="menu"
                className="composer__add"
                onClick={() => {
                  setRouteMenuOpen(false);
                  setEntryMenuOpen((current) => !current);
                }}
                type="button"
              >
                <span className="composer__visually-hidden">+</span>
                <ComposerPlusIcon />
              </button>

              {entryMenuOpen ? (
                <div
                  aria-label="Composer entry modes"
                  className="composer__entry-menu"
                  role="menu"
                >
                  <button
                    className="composer__entry-option"
                    onClick={() => handleEntryModeSelect("direct")}
                    type="button"
                  >
                    {t("chat.entry.direct")}
                  </button>
                  <button
                    className="composer__entry-option"
                    onClick={() => handleEntryModeSelect("choose_team")}
                    type="button"
                  >
                    {t("chat.entry.chooseTeam")}
                  </button>
                  <button
                    className="composer__entry-option"
                    onClick={() => handleEntryModeSelect("create_team")}
                    type="button"
                  >
                    {t("chat.entry.createTeam")}
                  </button>
                </div>
              ) : null}
            </div>

            {showTeamChooser ? (
              <div
                className="composer__workflow-pill"
                data-testid="chat-team-chooser"
              >
                <button
                  aria-expanded={teamPickerOpen}
                  aria-haspopup="listbox"
                  className="composer__workflow-trigger"
                  onClick={() => {
                    setRouteMenuOpen(false);
                    setTeamPickerOpen((current) => !current);
                  }}
                  type="button"
                >
                  <span className="composer__workflow-trigger-label">
                    {selectedTeam
                      ? selectedTeam.name
                      : t("chat.teamChooser.select")}
                  </span>
                  <ComposerChevronIcon />
                </button>
                <button
                  aria-label="Clear team chooser"
                  className="composer__workflow-clear"
                  onClick={() => {
                    setSelectedTeamId("");
                    setTeamPickerOpen(false);
                    setEntryMode("direct");
                    setRouteMenuOpen(false);
                  }}
                  type="button"
                >
                  <ComposerCloseIcon />
                </button>

                {teamPickerOpen ? (
                  <div
                    className="composer__workflow-options"
                    data-testid="chat-team-options"
                    role="listbox"
                  >
                    {availableTeams.map((team) => (
                      <button
                        className="composer__workflow-option"
                        data-team-id={team.id}
                        key={team.id}
                        onClick={() => {
                          setSelectedTeamId(team.id);
                          setTeamPickerOpen(false);
                          setRouteMenuOpen(false);
                        }}
                        type="button"
                      >
                        {team.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {showCreateTeamPill ? (
              <div
                className="composer__workflow-pill composer__workflow-pill--static"
                data-testid="chat-create-pill"
              >
                <span className="composer__workflow-trigger-label">
                  {t("chat.entry.createTeam")}
                </span>
                <button
                  aria-label="Clear create team"
                  className="composer__workflow-clear"
                  onClick={() => {
                    setTeamPickerOpen(false);
                    setEntryMode("direct");
                    setRouteMenuOpen(false);
                  }}
                  type="button"
                >
                  <ComposerCloseIcon />
                </button>
              </div>
            ) : null}

            <div className="composer__route">
              <button
                aria-expanded={routeMenuOpen}
                aria-haspopup="dialog"
                aria-label="Configure session route"
                className="composer__route-trigger composer__token-action composer__token-action--route"
                onClick={() => {
                  setEntryMenuOpen(false);
                  setTeamPickerOpen(false);
                  setRouteMenuOpen((current) => !current);
                }}
                type="button"
              >
                <span className="composer__token-action-copy">
                  <span className="composer__token-action-eyebrow">Route</span>
                  <span className="composer__token-action-value">
                    {routeSummary}
                  </span>
                </span>
                <ComposerChevronIcon />
              </button>
              {routeControls}
            </div>
            <button
              aria-label="Open external draft"
              className="composer__icon-action composer__icon-action--draft"
              disabled={isDrafting || isRouting}
              onClick={() => {
                void handleOpenExternalDraft();
              }}
              title="Open external draft"
              type="button"
            >
              <ComposerNoteIcon />
            </button>
          </div>

          <div className="composer__submit">
            <button
              aria-label="Send"
              className="composer__send composer__send--circle"
              disabled={
                !providerGate.ready || isRouting || prompt.trim().length === 0
              }
              onClick={() => {
                void handleSend();
              }}
              type="button"
            >
              {isRouting ? null : <ComposerSendIcon />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`page-layout chat-page ${landing ? "is-landing" : "is-active"}`}
    >
      <div className="page-layout__body chat-page__body">
        <div className="chat-stage">
          <SessionTabs
            activeSessionId={
              workspaceSessions.activeSessionId ??
              activeTeamRun?.id ??
              activeSessionRecord?.id ??
              null
            }
            onClose={handleSessionClose}
            onSelect={handleSessionSelect}
            sessions={visibleSessions}
          />

          <div
            className={`chat-stage__body ${landing ? "chat-stage__body--landing" : "chat-stage__body--active"}`}
          >
            {activeTitlebar ? (
              <div
                className="chat-session-titlebar"
                data-testid="chat-session-titlebar"
              >
                <span className="chat-session-titlebar__kind">
                  {activeTitlebar.kind}
                </span>
                <span
                  className="chat-session-titlebar__title"
                  title={activeTitlebar.title}
                >
                  {activeTitlebar.title}
                </span>
              </div>
            ) : null}

            {activeTeamRun ? (
              <>
                {runQueue}
                {recoveryPanel}
                <TeamRunPanel
                  isBusy={isTeamRunBusy}
                  onAddAgent={handleAddTeamRunAgent}
                  onBranchEvent={handleBranchTeamRun}
                  onContinue={handleContinueTeamRun}
                  run={activeTeamRun}
                />
              </>
            ) : landing ? (
              <div
                className="chat-landing-stack"
                data-testid="chat-landing-stack"
              >
                <div aria-label="Chat landing hero" className="chat-hero">
                  <NukaLockup className="chat-hero__lockup" width={240} />
                </div>

                {composer}
              </div>
            ) : sessionSwitchPending ? (
              <div
                aria-label="Workspace session loading"
                className="chat-stage__pending"
              />
            ) : (
              <section
                aria-label="Chat conversation surface"
                className="chat-surface"
              >
                <div className="chat-feed" role="log">
                  <div className="chat-feed__stack">
                    {activeMessages.map((message) => (
                      <ConversationEventBlock
                        key={message.id}
                        message={message}
                        onBranch={handleBranchDirectChat}
                        streamingChunks={
                          directPreviewMatchesActiveSession &&
                          directStreamingPreview?.assistantMessageId ===
                            message.id
                            ? directStreamingPreview.assistantChunks
                            : undefined
                        }
                      />
                    ))}
                    <MemoryReviewDock {...memoryReviewDock} />
                  </div>
                </div>
              </section>
            )}

            {landing || activeTeamRun ? null : composer}
          </div>
        </div>
      </div>
    </div>
  );
}
