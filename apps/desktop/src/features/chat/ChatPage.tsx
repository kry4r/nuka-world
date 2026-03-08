import { useMemo, useState } from "react";
import { NukaLockup } from "@/components/brand/NukaLockup";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import {
  routeWorldPrompt,
  type ChatMessage,
  type ChatProviderInfo,
  type ChatRouteResponse,
} from "@/lib/chat";

const QUICK_CHOICES = [
  "Summarize today's notes",
  "Plan my next workflow",
  "Review recent changes",
];

function formatRoute(route: ChatRouteResponse["route"] | null | undefined) {
  if (!route) {
    return "Direct reply";
  }

  switch (route.kind) {
    case "existing_workflow":
      return `Existing workflow ， ${route.workflowId}`;
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

  return `${sessionId.slice(0, 8)}${sessionId.length > 8 ? "´" : ""}`;
}

function formatProvider(provider: ChatProviderInfo | null) {
  if (!provider) {
    return "No provider selected";
  }

  return `${provider.name} ， ${provider.model}`;
}

function bubbleLabel(role: ChatMessage["role"]) {
  switch (role) {
    case "assistant":
      return "Assistant";
    case "system":
      return "System";
    case "tool":
      return "Tool";
    case "user":
    default:
      return "You";
  }
}

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [session, setSession] = useState<ChatRouteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRouting, setIsRouting] = useState(false);

  const landing = messages.length === 0;

  const inspector = useMemo(() => {
    if (!session) {
      return null;
    }

    return (
      <Inspector description="Real session metadata, configured provider, and attached context for the current World conversation." title="Context Inspector">
        <Card description={`Session ${formatSession(session.session.id)}`} title="Session" tone="accent" />
        <Card description={formatRoute(session.route)} title="Route" />
        <Card description={formatProvider(session.provider)} title="Provider" />
        <Card
          description={`${messages.length} message${messages.length === 1 ? "" : "s"} ， ${session.context.attachedAgents.length} agents ， ${session.context.attachedKnowledgeLibraries.length} libraries`}
          title="History"
        />
      </Inspector>
    );
  }, [messages.length, session]);

  const handleSend = async (nextPrompt?: string) => {
    const value = (nextPrompt ?? prompt).trim();

    if (!value) {
      return;
    }

    setError(null);
    setPrompt("");
    setIsRouting(true);

    try {
      const response = await routeWorldPrompt(value, session?.session.id);
      setSession(response);
      setMessages((current) => [...current, ...response.messages]);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
    } finally {
      setIsRouting(false);
    }
  };

  return (
    <div className={`page-layout chat-page ${landing ? "is-landing" : "is-active"}`}>
      <div className="page-layout__body chat-page__body">
        <div className="page-layout__main chat-stage">
          <div className={`chat-stage__body ${landing ? "chat-stage__body--landing" : "chat-stage__body--active"}`}>
            {landing ? (
              <div aria-label="World chat landing hero" className="chat-hero">
                <NukaLockup className="chat-hero__lockup" width={220} />
              </div>
            ) : (
              <section className="chat-surface" aria-label="World conversation surface">
                <header className="chat-surface__header">
                  <div className="chat-surface__identity">
                    <span className="chat-surface__eyebrow">World Chat</span>
                    <span className="chat-surface__meta">
                      Session {formatSession(session?.session.id)} ， {formatRoute(session?.route)}
                    </span>
                  </div>
                  <span aria-label="World chat session status" className="chat-surface__status">
                    Session live
                  </span>
                </header>

                <div className="chat-feed" role="log">
                  <div className="chat-feed__stack">
                    {messages.map((message) => (
                      <article className={`chat-bubble chat-bubble--${message.role}`} key={message.id}>
                        <span className="chat-bubble__label">{bubbleLabel(message.role)}</span>
                        <p className="chat-bubble__content">{message.content}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {error ? <Card description={error} title="Backend Error" tone="soft" /> : null}

            <div aria-label="World chat composer" className={`composer composer--chat ${landing ? "composer--landing" : "composer--active"}`}>
              {landing ? null : (
                <div aria-label="Conversation quick actions" className="composer__choices">
                  {QUICK_CHOICES.map((choice) => (
                    <button
                      className="composer__choice"
                      key={choice}
                      onClick={() => void handleSend(choice)}
                      type="button"
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}

              <div className="composer__bar">
                <div className="composer__field">
                  <textarea
                    className="composer__input"
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSend();
                      }
                    }}
                    placeholder={landing ? "Message World to start a session..." : "Reply to World..."}
                    rows={1}
                    value={prompt}
                  />
                </div>
                <button
                  aria-label={landing ? "Send to World" : "Send"}
                  className="composer__send"
                  disabled={isRouting || prompt.trim().length === 0}
                  onClick={() => void handleSend()}
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
