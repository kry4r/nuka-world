import { useEffect, useMemo, useState } from "react";
import { NukaLockup } from "@/components/brand/NukaLockup";
import { routeWorldPrompt, type ChatMessage, type ChatRouteResponse } from "@/lib/chat";
import { MemoryReviewDock } from "@/components/memory/MemoryReviewDock";
import { useProviderGate } from "@/hooks/useProviderGate";
import { useMemoryReviewDock } from "@/hooks/useMemoryReviewDock";
import { useWorkspaceSessions } from "@/hooks/useWorkspaceSessions";
import {
  addTeamRunAgent,
  continueTeamRun,
  createTeamFromGoal,
  listTeams,
  startTeamRun,
  type TeamRecord,
  type TeamRunRecord,
} from "@/lib/team";
import { ConversationEventBlock } from "./ConversationEventBlock";
import { SessionTabs } from "./SessionTabs";
import { SuggestionStrip } from "./SuggestionStrip";
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

function formatRoute(route: ChatRouteResponse["route"] | null | undefined) {
  if (!route || route.kind === "direct_reply") {
    return "Direct reply";
  }

  return "Direct reply";
}

function formatSession(sessionId: string | undefined) {
  if (!sessionId) {
    return "Pending";
  }

  return `${sessionId.slice(0, 8)}${sessionId.length > 8 ? SESSION_ELLIPSIS : ""}`;
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

function entrySummary(entryMode: ComposerEntryMode, selectedTeam: TeamRecord | null) {
  switch (entryMode) {
    case "create_team":
      return "Create team";
    case "choose_team":
      return selectedTeam ? `Team: ${selectedTeam.name}` : "Choose team";
    case "direct":
    default:
      return "Direct chat";
  }
}

function composerPlaceholder(landing: boolean, entryMode: ComposerEntryMode) {
  if (!landing) {
    return "Reply to World...";
  }

  switch (entryMode) {
    case "create_team":
      return "Describe the team goal you want to run...";
    case "choose_team":
      return "";
    case "direct":
    default:
      return "Message World to start a session...";
  }
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
      <path d="M3 8h8.5" />
      <path d="M8.5 3.5 13 8l-4.5 4.5" />
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
  const providerGate = useProviderGate();
  const workspaceSessions = useWorkspaceSessions();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [session, setSession] = useState<ChatRouteResponse | null>(null);
  const [entryMode, setEntryMode] = useState<ComposerEntryMode>("direct");
  const [entryMenuOpen, setEntryMenuOpen] = useState(false);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<TeamRecord[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [teamRunState, setTeamRunState] = useState<TeamRunRecord | null>(null);
  const [teamRunError, setTeamRunError] = useState<string | null>(null);
  const [isTeamRunBusy, setIsTeamRunBusy] = useState(false);
  const activeDirectSession =
    workspaceSessions.activeSession?.kind === "direct_chat"
      ? workspaceSessions.activeSession
      : null;
  const workspaceTeamRun =
    workspaceSessions.activeSession?.kind === "team_run"
      ? workspaceSessions.activeSession.run
      : null;
  const activeTeamRun = teamRunState ?? workspaceTeamRun;
  const activeSessionRecord = activeDirectSession?.session ?? session?.session ?? null;
  const activeMessages = activeDirectSession?.messages ?? messages;
  const activeRoute =
    activeSessionRecord?.id && activeSessionRecord.id === session?.session.id
      ? session?.route
      : null;
  const selectedTeam = useMemo(
    () => availableTeams.find((team) => team.id === selectedTeamId) ?? null,
    [availableTeams, selectedTeamId],
  );
  const memoryReviewDock = useMemoryReviewDock(
    "chat",
    activeDirectSession?.session.id ?? session?.session.id ?? null,
    activeDirectSession?.session.messageCount ?? session?.session.messageCount ?? null,
  );

  const landing = activeMessages.length === 0 && workspaceSessions.sessions.length === 0 && !activeTeamRun;
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

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setTeamRunState(workspaceTeamRun);
    setTeamRunError(null);
  }, [workspaceTeamRun]);

  const handleEntryModeSelect = (nextMode: ComposerEntryMode) => {
    setEntryMode(nextMode);
    setEntryMenuOpen(false);
    setError(null);
    setNotice(null);

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
    setTeamPickerOpen(false);
    setSelectedTeamId("");
    setEntryMode("direct");
    setError(null);
    setNotice(null);
  };

  const handleSend = async (nextPrompt?: string) => {
    if (isRouting || !providerGate.ready) {
      return;
    }

    const value = (nextPrompt ?? prompt).trim();
    if (!value) {
      return;
    }

    if (entryMode === "choose_team" && !selectedTeamId.trim()) {
      setError("Select a team before sending.");
      return;
    }

    setPrompt("");
    setError(null);
    setNotice(null);
    setEntryMenuOpen(false);
    setTeamPickerOpen(false);
    setIsRouting(true);

    try {
      if (entryMode === "create_team") {
        const created = await createTeamFromGoal(value);
        setAvailableTeams((current) => {
          const existingIndex = current.findIndex((team) => team.id === created.id);
          if (existingIndex === -1) {
            return [...current, created];
          }

          return current.map((team, index) => (index === existingIndex ? created : team));
        });
        setSelectedTeamId(created.id);
        setEntryMode("direct");
        setNotice(`Team created: ${created.name}`);
        return;
      }

      if (entryMode === "choose_team") {
        let run = await startTeamRun(selectedTeamId.trim());
        run = await continueTeamRun(run.id, value);
        setTeamRunState(run);
        setSelectedTeamId("");
        setEntryMode("direct");
        void workspaceSessions.refresh({
          id: run.id,
          kind: "team_run",
        });
        return;
      }

      const response = await routeWorldPrompt(value, activeSessionRecord?.id, {
        kind: "chat_only",
      });
      setMessages((current) => [...current, ...response.messages]);
      setSession(response);
      void workspaceSessions.refresh({
        id: response.session.id,
        kind: "direct_chat",
      });
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
    } finally {
      setIsRouting(false);
    }
  };

  const handleContinueTeamRun = async (nextPrompt: string) => {
    if (!activeTeamRun || isTeamRunBusy) {
      return;
    }

    setIsTeamRunBusy(true);
    setTeamRunError(null);

    try {
      const updated = await continueTeamRun(activeTeamRun.id, nextPrompt);
      setTeamRunState(updated);
      void workspaceSessions.refresh({
        id: updated.id,
        kind: "team_run",
      });
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      setTeamRunError(message);
    } finally {
      setIsTeamRunBusy(false);
    }
  };

  const handleAddTeamRunAgent = async (agent: TeamRunPanelAgentDraft) => {
    if (!activeTeamRun || isTeamRunBusy) {
      return;
    }

    setIsTeamRunBusy(true);
    setTeamRunError(null);

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
      void workspaceSessions.refresh({
        id: updated.id,
        kind: "team_run",
      });
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      setTeamRunError(message);
    } finally {
      setIsTeamRunBusy(false);
    }
  };

  const composer = (
    <div
      aria-label="World chat composer"
      className={`composer composer--chat ${landing ? "composer--landing" : "composer--active"}`}
    >
      {!landing ? (
        <SuggestionStrip
          disabled={!providerGate.ready || isRouting}
          onSelect={(choice) => {
            void handleSend(choice);
          }}
          suggestions={suggestionsForMode(entryMode)}
        />
      ) : null}

      {error ? (
        <div className="composer__inline-feedback composer__inline-feedback--error">{error}</div>
      ) : null}
      {notice ? (
        <div className="composer__inline-feedback composer__inline-feedback--notice">{notice}</div>
      ) : null}

      <div
        className={`composer__bar ${
          showTeamChooser || showCreateTeamPill ? "composer__bar--pill" : ""
        }`}
      >
        <div className="composer__menu">
          <button
            aria-expanded={entryMenuOpen}
            aria-haspopup="menu"
            className="composer__add"
            onClick={() => setEntryMenuOpen((current) => !current)}
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
                Direct chat
              </button>
              <button
                className="composer__entry-option"
                onClick={() => handleEntryModeSelect("choose_team")}
                type="button"
              >
                Choose team
              </button>
              <button
                className="composer__entry-option"
                onClick={() => handleEntryModeSelect("create_team")}
                type="button"
              >
                Create team
              </button>
            </div>
          ) : null}
        </div>

        {showTeamChooser ? (
          <div className="composer__workflow-pill" data-testid="chat-team-chooser">
            <button
              aria-expanded={teamPickerOpen}
              aria-haspopup="listbox"
              className="composer__workflow-trigger"
              onClick={() => setTeamPickerOpen((current) => !current)}
              type="button"
            >
              <span className="composer__workflow-trigger-label">
                {selectedTeam ? selectedTeam.name : "Select team"}
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
                setError(null);
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
                      setError(null);
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
          <div className="composer__workflow-pill composer__workflow-pill--static" data-testid="chat-create-pill">
            <span className="composer__workflow-trigger-label">Create team</span>
            <button
              aria-label="Clear create team"
              className="composer__workflow-clear"
              onClick={() => {
                setTeamPickerOpen(false);
                setEntryMode("direct");
                setError(null);
              }}
              type="button"
            >
              <ComposerCloseIcon />
            </button>
          </div>
        ) : null}

        <div className="composer__field">
          <textarea
            className="composer__input"
            disabled={!providerGate.ready}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={composerPlaceholder(landing, entryMode)}
            rows={1}
            value={prompt}
          />
        </div>

        <button
          aria-label={landing ? "Send to World" : "Send"}
          className="composer__send"
          disabled={!providerGate.ready || isRouting || prompt.trim().length === 0}
          onClick={() => {
            void handleSend();
          }}
          type="button"
        >
          {landing ? (
            <>
              <span className="composer__visually-hidden">
                {isRouting ? "..." : "Send"}
              </span>
              <ComposerSendIcon />
            </>
          ) : (
            <>
              <span className="composer__send-label">{isRouting ? "..." : "Send"}</span>
              {isRouting ? null : <ComposerSendIcon />}
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className={`page-layout chat-page ${landing ? "is-landing" : "is-active"}`}>
      <div className="page-layout__body chat-page__body">
        <div className="chat-stage">
          <SessionTabs
            activeSessionId={workspaceSessions.activeSessionId}
            onSelect={handleSessionSelect}
            sessions={workspaceSessions.sessions}
          />

          <div
            className={`chat-stage__body ${landing ? "chat-stage__body--landing" : "chat-stage__body--active"}`}
          >
            {activeTeamRun ? (
              <TeamRunPanel
                error={teamRunError}
                isBusy={isTeamRunBusy}
                onAddAgent={handleAddTeamRunAgent}
                onContinue={handleContinueTeamRun}
                run={activeTeamRun}
              />
            ) : landing ? (
              <div className="chat-landing-stack" data-testid="chat-landing-stack">
                <div aria-label="World chat landing hero" className="chat-hero">
                  <NukaLockup className="chat-hero__lockup" width={240} />
                </div>

                {composer}
              </div>
            ) : (
              <section aria-label="World conversation surface" className="chat-surface">
                <header className="chat-surface__header">
                  <div className="chat-surface__identity">
                    <span className="chat-surface__eyebrow">
                      {entrySummary(entryMode, selectedTeam)}
                    </span>
                    <span className="chat-surface__meta">
                      Session {formatSession(activeSessionRecord?.id)}
                      {META_SEPARATOR}
                      {formatRoute(activeRoute)}
                    </span>
                  </div>
                </header>

                <div className="chat-feed" role="log">
                  <div className="chat-feed__stack">
                    {activeMessages.map((message) => (
                      <ConversationEventBlock key={message.id} message={message} />
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
