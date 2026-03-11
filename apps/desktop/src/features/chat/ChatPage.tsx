import { useState } from "react";
import { NukaLockup } from "@/components/brand/NukaLockup";
import { routeWorldPrompt, type ChatMessage, type ChatMode, type ChatRouteResponse } from "@/lib/chat";
import { MemoryReviewDock } from "@/components/memory/MemoryReviewDock";
import { useProviderGate } from "@/hooks/useProviderGate";
import { useMemoryReviewDock } from "@/hooks/useMemoryReviewDock";
import { WORKFLOW_DEFINITIONS, type WorkflowLaunchIntent } from "@/lib/workflow";
import { ConversationEventBlock } from "./ConversationEventBlock";
import { SuggestionStrip } from "./SuggestionStrip";

const CHAT_ONLY_SUGGESTIONS = [
  "Summarize today's notes",
  "Plan my next workflow",
  "Review recent changes",
];

const CREATE_WORKFLOW_SUGGESTIONS = [
  "Outline the workflow goal",
  "List the key steps",
  "Define the success criteria",
];

const SPECIFIC_WORKFLOW_SUGGESTIONS = [
  "Review required inputs",
  "Check the next node",
  "Summarize workflow progress",
];

type ComposerEntryMode = "direct" | "choose_workflow" | "create_workflow";

type WorkflowToken = {
  workflowId: string;
  label: string;
};

const SAVED_WORKFLOW_OPTIONS = WORKFLOW_DEFINITIONS.map(({ id, label }) => ({
  id,
  label,
}));

const META_SEPARATOR = " · ";
const SESSION_ELLIPSIS = "…";

function formatRoute(route: ChatRouteResponse["route"] | null | undefined) {
  if (!route) {
    return "Direct reply";
  }

  switch (route.kind) {
    case "existing_workflow":
      return `Existing workflow${META_SEPARATOR}${route.workflowId}`;
    case "new_workflow":
      return "Workflow draft";
    case "direct_reply":
    default:
      return "Direct reply";
  }
}

function formatSession(sessionId: string | undefined) {
  if (!sessionId) {
    return "Pending";
  }

  return `${sessionId.slice(0, 8)}${sessionId.length > 8 ? SESSION_ELLIPSIS : ""}`;
}

function workflowLabel(workflowId: string) {
  return (
    SAVED_WORKFLOW_OPTIONS.find((workflow) => workflow.id === workflowId)?.label ??
    workflowId
  );
}

function resolveDraftMode(
  entryMode: ComposerEntryMode,
  workflowId: string,
): ChatMode | null {
  switch (entryMode) {
    case "create_workflow":
      return { kind: "create_workflow" };
    case "choose_workflow":
      return workflowId.trim()
        ? { kind: "specific_workflow", workflowId: workflowId.trim() }
        : null;
    case "direct":
    default:
      return { kind: "chat_only" };
  }
}

function resolveActiveMode(sessionMode: ChatMode | null, draftMode: ChatMode | null): ChatMode {
  if (!sessionMode) {
    return draftMode ?? { kind: "chat_only" };
  }

  if (
    sessionMode.kind === "chat_only" &&
    draftMode &&
    draftMode.kind !== "chat_only"
  ) {
    return draftMode;
  }

  return sessionMode;
}

function mergeSessionMode(current: ChatMode | null, nextMode: ChatMode): ChatMode {
  if (!current || current.kind === "chat_only") {
    return nextMode;
  }

  return current;
}

function suggestionsForMode(mode: ChatMode) {
  switch (mode.kind) {
    case "create_workflow":
      return CREATE_WORKFLOW_SUGGESTIONS;
    case "specific_workflow":
      return SPECIFIC_WORKFLOW_SUGGESTIONS;
    case "chat_only":
    default:
      return CHAT_ONLY_SUGGESTIONS;
  }
}

function entrySummary(entryMode: ComposerEntryMode, selectedWorkflowId: string) {
  switch (entryMode) {
    case "create_workflow":
      return "Create workflow";
    case "choose_workflow":
      return selectedWorkflowId ? `Workflow: ${workflowLabel(selectedWorkflowId)}` : "Choose workflow";
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
    case "create_workflow":
      return "Describe the workflow you want to generate...";
    case "choose_workflow":
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

type ChatPageProps = {
  onWorkflowHandoff?: (handoff: WorkflowLaunchIntent) => void;
};

export function ChatPage({ onWorkflowHandoff }: ChatPageProps = {}) {
  const providerGate = useProviderGate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [session, setSession] = useState<ChatRouteResponse | null>(null);
  const [sessionMode, setSessionMode] = useState<ChatMode | null>(null);
  const [entryMode, setEntryMode] = useState<ComposerEntryMode>("direct");
  const [entryMenuOpen, setEntryMenuOpen] = useState(false);
  const [workflowPickerOpen, setWorkflowPickerOpen] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [workflowToken, setWorkflowToken] = useState<WorkflowToken | null>(null);
  const [workflowHandoff, setWorkflowHandoff] = useState<WorkflowLaunchIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const memoryReviewDock = useMemoryReviewDock(
    "chat",
    session?.session.id ?? null,
    session?.session.messageCount ?? null,
  );

  const landing = messages.length === 0;
  const draftMode = resolveDraftMode(entryMode, selectedWorkflowId);
  const composerMode = resolveActiveMode(sessionMode, draftMode);
  const showWorkflowChooser = entryMode === "choose_workflow" && !workflowToken;
  const showCreateWorkflowPill =
    entryMode === "create_workflow" &&
    !workflowToken &&
    workflowHandoff?.kind !== "open_workflow_lobby";

  const handleEntryModeSelect = (nextMode: ComposerEntryMode) => {
    if (!sessionMode || sessionMode.kind === "chat_only") {
      setEntryMode(nextMode);
    }

    if (nextMode === "choose_workflow") {
      setSelectedWorkflowId("");
      setWorkflowPickerOpen(true);
    } else {
      setSelectedWorkflowId("");
      setWorkflowPickerOpen(false);
    }

    setEntryMenuOpen(false);
    setError(null);
  };

  const handleSend = async (nextPrompt?: string) => {
    if (isRouting || !providerGate.ready) {
      return;
    }

    const value = (nextPrompt ?? prompt).trim();
    if (!value) {
      return;
    }

    const nextDraftMode = resolveDraftMode(entryMode, selectedWorkflowId);
    if (!nextDraftMode) {
      setError("Select a workflow before sending.");
      return;
    }

    const mode = resolveActiveMode(sessionMode, nextDraftMode);

    setPrompt("");
    setError(null);
    setEntryMenuOpen(false);
    setWorkflowPickerOpen(false);
    setIsRouting(true);

    try {
      const response = await routeWorldPrompt(value, session?.session.id, mode);
      setMessages((current) => [...current, ...response.messages]);
      setSession(response);
      setSessionMode((current) => mergeSessionMode(current, mode));

      if (
        mode.kind === "specific_workflow" &&
        response.route.kind === "existing_workflow"
      ) {
        const handoff: WorkflowLaunchIntent = {
          kind: "open_workflow_room",
          workflowId: response.route.workflowId,
          prompt: value,
          origin: {
            sourceMode: "specific_workflow",
            sourceSessionId: response.session.id,
          },
        };

        setWorkflowToken({
          workflowId: response.route.workflowId,
          label: workflowLabel(response.route.workflowId),
        });
        setWorkflowHandoff(handoff);
        onWorkflowHandoff?.(handoff);
      } else if (
        mode.kind === "create_workflow" &&
        response.route.kind === "new_workflow"
      ) {
        setWorkflowToken(null);
        setWorkflowHandoff({
          kind: "open_workflow_lobby",
          prompt: value,
          origin: {
            sourceMode: "create_workflow",
            sourceSessionId: response.session.id,
          },
        });
      } else {
        setWorkflowToken(null);
        setWorkflowHandoff(null);
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
    } finally {
      setIsRouting(false);
    }
  };

  const composer = (
    <div
      aria-label="World chat composer"
      className={`composer composer--chat ${landing ? "composer--landing" : "composer--active"}`}
    >
      {workflowToken ? (
        <div className="composer__workflow-token" data-testid="chat-workflow-token">
          <span className="composer__workflow-token-label">{workflowToken.label}</span>
          <div className="composer__workflow-token-actions">
            <button
              className="composer__token-action"
              onClick={() => {
                if (workflowHandoff?.kind === "open_workflow_room") {
                  onWorkflowHandoff?.(workflowHandoff);
                  window.dispatchEvent(
                    new CustomEvent("nuka:navigate", {
                      detail: { page: "workflow" },
                    }),
                  );
                }
              }}
              type="button"
            >
              Open Workflow
            </button>
            <button
              className="composer__token-action"
              onClick={() => {
                setWorkflowToken(null);
                setWorkflowHandoff(null);
                setSelectedWorkflowId("");
                setWorkflowPickerOpen(false);
                setEntryMode("direct");
                setSessionMode({ kind: "chat_only" });
              }}
              type="button"
            >
              Clear Workflow
            </button>
          </div>
        </div>
      ) : null}

      {workflowHandoff?.kind === "open_workflow_lobby" ? (
        <div className="composer__draft-status">
          <span>Workflow draft ready</span>
          <button
            className="composer__token-action"
            onClick={() => onWorkflowHandoff?.(workflowHandoff)}
            type="button"
          >
            Open Workflow
          </button>
        </div>
      ) : null}

      {!landing ? (
        <SuggestionStrip
          disabled={!providerGate.ready || isRouting}
          onSelect={(choice) => {
            void handleSend(choice);
          }}
          suggestions={suggestionsForMode(composerMode)}
        />
      ) : null}

      {providerGate.blocked ? (
        <div className="composer__inline-feedback" data-testid="chat-provider-inline">
          <span>{providerGate.message}</span>
          <button
            className="composer__token-action"
            onClick={providerGate.openSettings}
            type="button"
          >
            Open Settings
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="composer__inline-feedback composer__inline-feedback--error">{error}</div>
      ) : null}

      <div
        className={`composer__bar ${
          showWorkflowChooser || showCreateWorkflowPill ? "composer__bar--pill" : ""
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
                onClick={() => handleEntryModeSelect("choose_workflow")}
                type="button"
              >
                Choose workflow
              </button>
              <button
                className="composer__entry-option"
                onClick={() => handleEntryModeSelect("create_workflow")}
                type="button"
              >
                Create workflow
              </button>
            </div>
          ) : null}
        </div>

        {showWorkflowChooser ? (
          <div className="composer__workflow-pill" data-testid="chat-workflow-chooser">
            <button
              aria-expanded={workflowPickerOpen}
              aria-haspopup="listbox"
              className="composer__workflow-trigger"
              onClick={() => setWorkflowPickerOpen((current) => !current)}
              type="button"
            >
              <span className="composer__workflow-trigger-label">
                {selectedWorkflowId ? workflowLabel(selectedWorkflowId) : "Select workflow"}
              </span>
              <ComposerChevronIcon />
            </button>
            <button
              aria-label="Clear workflow chooser"
              className="composer__workflow-clear"
              onClick={() => {
                setSelectedWorkflowId("");
                setWorkflowPickerOpen(false);
                setEntryMode("direct");
                setError(null);
              }}
              type="button"
            >
              <ComposerCloseIcon />
            </button>

            {workflowPickerOpen ? (
              <div
                className="composer__workflow-options"
                data-testid="chat-workflow-options"
                role="listbox"
              >
                {SAVED_WORKFLOW_OPTIONS.map((workflow) => (
                  <button
                    className="composer__workflow-option"
                    data-workflow-id={workflow.id}
                    key={workflow.id}
                    onClick={() => {
                      setSelectedWorkflowId(workflow.id);
                      setWorkflowPickerOpen(false);
                      setError(null);
                    }}
                    type="button"
                  >
                    {workflow.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {showCreateWorkflowPill ? (
          <div className="composer__workflow-pill composer__workflow-pill--static" data-testid="chat-create-pill">
            <span className="composer__workflow-trigger-label">Create workflow</span>
            <button
              aria-label="Clear create workflow"
              className="composer__workflow-clear"
              onClick={() => {
                setWorkflowPickerOpen(false);
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
          <div
            className={`chat-stage__body ${landing ? "chat-stage__body--landing" : "chat-stage__body--active"}`}
          >
            {landing ? (
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
                    <span className="chat-surface__eyebrow">{entrySummary(entryMode, selectedWorkflowId)}</span>
                    <span className="chat-surface__meta">
                      Session {formatSession(session?.session.id)}
                      {META_SEPARATOR}
                      {formatRoute(session?.route)}
                    </span>
                  </div>
                </header>

                <div className="chat-feed" role="log">
                  <div className="chat-feed__stack">
                    {messages.map((message) => (
                      <ConversationEventBlock key={message.id} message={message} />
                    ))}
                    <MemoryReviewDock {...memoryReviewDock} />
                  </div>
                </div>
              </section>
            )}

            {landing ? null : composer}
          </div>
        </div>
      </div>
    </div>
  );
}
