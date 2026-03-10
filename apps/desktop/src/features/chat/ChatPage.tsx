import { useMemo, useState } from "react";
import { NukaLockup } from "@/components/brand/NukaLockup";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import {
  routeWorldPrompt,
  type ChatMessage,
  type ChatMode,
  type ChatProviderInfo,
  type ChatRouteResponse,
} from "@/lib/chat";
import {
  WORKFLOW_DEFINITIONS,
  type WorkflowLaunchIntent,
} from "@/lib/workflow";
import { useProviderGate } from "@/hooks/useProviderGate";
import { useMemoryReviewDock } from "@/hooks/useMemoryReviewDock";
import { MemoryReviewDock } from "@/components/memory/MemoryReviewDock";
import { ChatModeSwitcher } from "./ChatModeSwitcher";
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

const SAVED_WORKFLOW_OPTIONS = WORKFLOW_DEFINITIONS.map(({ id, label }) => ({
  id,
  label,
}));

const META_SEPARATOR = " \u00b7 ";
const SESSION_ELLIPSIS = "\u2026";

type ChatModeKind = ChatMode["kind"];

function formatRoute(route: ChatRouteResponse["route"] | null | undefined) {
  if (!route) {
    return "Direct reply";
  }

  switch (route.kind) {
    case "existing_workflow":
      return `Existing workflow${META_SEPARATOR}${route.workflowId}`;
    case "new_workflow":
      return "New workflow";
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

function formatProvider(provider: ChatProviderInfo | null) {
  if (!provider) {
    return "No provider selected";
  }

  return `${provider.name}${META_SEPARATOR}${provider.model}`;
}

function formatMode(mode: ChatMode) {
  switch (mode.kind) {
    case "create_workflow":
      return "Create workflow";
    case "specific_workflow":
      return `Specific workflow${META_SEPARATOR}${mode.workflowId}`;
    case "chat_only":
    default:
      return "Chat only";
  }
}

function resolveDraftMode(kind: ChatModeKind, workflowId: string): ChatMode | null {
  switch (kind) {
    case "create_workflow":
      return { kind: "create_workflow" };
    case "specific_workflow":
      return workflowId.trim()
        ? { kind: "specific_workflow", workflowId: workflowId.trim() }
        : null;
    case "chat_only":
    default:
      return { kind: "chat_only" };
  }
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

function workflowLabel(workflowId: string) {
  return (
    SAVED_WORKFLOW_OPTIONS.find((workflow) => workflow.id === workflowId)?.label ??
    workflowId
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
  const [modeKind, setModeKind] = useState<ChatModeKind>("chat_only");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [workflowHandoff, setWorkflowHandoff] = useState<WorkflowLaunchIntent | null>(null);
  const memoryReviewDock = useMemoryReviewDock(
    "chat",
    session?.session.id ?? null,
    session?.session.messageCount ?? null,
  );

  const landing = messages.length === 0;
  const draftMode = resolveDraftMode(modeKind, selectedWorkflowId);
  const composerMode = sessionMode ?? draftMode;
  const modeValue = sessionMode?.kind ?? modeKind;

  const inspector = useMemo(() => {
    if (!session) {
      return null;
    }

    return (
      <Inspector
        description="Real session metadata, configured provider, and attached context for the current World conversation."
        title="Context Inspector"
      >
        <Card
          description={`Session ${formatSession(session.session.id)}`}
          title="Session"
          tone="accent"
        />
        <Card description={formatRoute(session.route)} title="Route" />
        <Card description={formatProvider(session.provider)} title="Provider" />
        <Card
          description={`${messages.length} message${messages.length === 1 ? "" : "s"}${META_SEPARATOR}${session.context.attachedAgents.length} agents${META_SEPARATOR}${session.context.attachedKnowledgeLibraries.length} libraries`}
          title="History"
        />
      </Inspector>
    );
  }, [messages.length, session]);

  const handleModeChange = (nextKind: ChatModeKind) => {
    if (sessionMode) {
      return;
    }

    setModeKind(nextKind);
    if (nextKind !== "specific_workflow") {
      setSelectedWorkflowId("");
    }
    setError(null);
    setWorkflowHandoff(null);
  };

  const handleSend = async (nextPrompt?: string) => {
    if (isRouting || !providerGate.ready) {
      return;
    }

    const value = (nextPrompt ?? prompt).trim();
    if (!value) {
      return;
    }

    const mode = sessionMode ?? resolveDraftMode(modeKind, selectedWorkflowId);
    if (!mode) {
      setError("Select a workflow before sending.");
      return;
    }

    setError(null);
    setPrompt("");
    setIsRouting(true);
    setWorkflowHandoff(null);

    try {
      const response = await routeWorldPrompt(value, session?.session.id, mode);
      setSession(response);
      setSessionMode((current) => current ?? mode);
      setMessages((current) => [...current, ...response.messages]);

      if (
        mode.kind === "create_workflow" &&
        response.route.kind === "new_workflow"
      ) {
        setWorkflowHandoff({
          kind: "open_workflow_lobby",
          prompt: value,
          origin: {
            sourceMode: "create_workflow",
            sourceSessionId: response.session.id,
          },
        });
      }

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

        setWorkflowHandoff(handoff);
        onWorkflowHandoff?.(handoff);
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
    } finally {
      setIsRouting(false);
    }
  };

  const composerContext = sessionMode
    ? `Session mode: ${formatMode(sessionMode)}`
    : modeKind === "specific_workflow"
      ? selectedWorkflowId
        ? `Starting in ${workflowLabel(selectedWorkflowId)}`
        : "Choose a saved workflow before sending."
      : draftMode
        ? `Starting in ${formatMode(draftMode)}`
        : "Choose a chat mode before sending.";

  return (
    <div className={`page-layout chat-page ${landing ? "is-landing" : "is-active"}`}>
      <div className="page-layout__body chat-page__body">
        <div className="page-layout__main chat-stage">
          <div
            className={`chat-stage__body ${landing ? "chat-stage__body--landing" : "chat-stage__body--active"}`}
          >
            {landing ? (
              <div aria-label="World chat landing hero" className="chat-hero">
                <NukaLockup className="chat-hero__lockup" width={220} />
              </div>
            ) : (
              <section aria-label="World conversation surface" className="chat-surface">
                <header className="chat-surface__header">
                  <div className="chat-surface__identity">
                    <span className="chat-surface__eyebrow">World Chat</span>
                    <span className="chat-surface__meta">
                      Session {formatSession(session?.session.id)}
                      {META_SEPARATOR}
                      {formatRoute(session?.route)}
                    </span>
                  </div>
                  <span
                    aria-label="World chat session status"
                    className="chat-surface__status"
                  >
                    Session live
                  </span>
                </header>

                <div className="chat-feed" role="log">
                  <div className="chat-feed__stack">
                    {messages.map((message) => (
                      <ConversationEventBlock key={message.id} message={message} />
                    ))}
                  </div>
                </div>
              </section>
            )}

            {error ? <Card description={error} title="Backend Error" tone="soft" /> : null}

            {providerGate.blocked ? (
              <Card description={providerGate.message} title="Provider required" tone="soft">
                <div className="settings-panel__footer">
                  <button
                    className="settings-button settings-button--accent"
                    onClick={providerGate.openSettings}
                    type="button"
                  >
                    Open Settings
                  </button>
                </div>
              </Card>
            ) : null}

            {workflowHandoff?.kind === "open_workflow_lobby" ? (
              <Card
                description={`World clarified the task in session ${formatSession(workflowHandoff.origin.sourceSessionId)}. Move into Workflow when you want a dedicated room.`}
                title="Workflow handoff ready"
                tone="accent"
              >
                <div className="settings-panel__footer">
                  <button
                    className="settings-button settings-button--accent"
                    onClick={() => onWorkflowHandoff?.(workflowHandoff)}
                    type="button"
                  >
                    Open Workflow
                  </button>
                </div>
              </Card>
            ) : null}

            <div
              aria-label="World chat composer"
              className={`composer composer--chat ${landing ? "composer--landing" : "composer--active"}`}
            >
              {!landing && composerMode ? (
                <SuggestionStrip
                  disabled={!providerGate.ready || isRouting}
                  onSelect={(choice) => {
                    void handleSend(choice);
                  }}
                  suggestions={suggestionsForMode(composerMode)}
                />
              ) : null}

              <div className="composer__context">
                <div className="composer__context-copy">
                  <span className="composer__context-eyebrow">Composer context</span>
                  <span className="composer__context-value">{composerContext}</span>
                </div>
                <ChatModeSwitcher
                  disabled={Boolean(sessionMode)}
                  onChange={handleModeChange}
                  value={modeValue}
                />
              </div>

              {!sessionMode && modeKind === "specific_workflow" ? (
                <label className="composer__workflow-picker">
                  <span>Saved workflow</span>
                  <select
                    onChange={(event) => {
                      setSelectedWorkflowId(event.target.value);
                      setError(null);
                    }}
                    value={selectedWorkflowId}
                  >
                    <option value="">Select a workflow</option>
                    {SAVED_WORKFLOW_OPTIONS.map((workflow) => (
                      <option key={workflow.id} value={workflow.id}>
                        {workflow.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <MemoryReviewDock {...memoryReviewDock} />

              <div className="composer__bar">
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
                    placeholder={
                      landing
                        ? "Message World to start a session..."
                        : "Reply to World..."
                    }
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
                  {isRouting ? "..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {inspector}
      </div>
    </div>
  );
}
