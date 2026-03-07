import { useMemo, useState } from "react";
import { NukaLogo } from "@/components/brand/NukaLogo";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import { routeWorldPrompt, type ChatRouteResponse } from "@/lib/chat";

type ChatMessage = {
  id: string;
  role: "user" | "world";
  content: string;
};

const QUICK_CHOICES = [
  "Summarize today's notes",
  "Plan my next workflow",
  "Review recent changes",
];

function buildWorldReply(response: ChatRouteResponse | null, prompt: string) {
  if (!response) {
    return `I have staged your request: ${prompt}`;
  }

  switch (response.route.kind) {
    case "existing_workflow":
      return `I routed this into workflow ${response.route.workflowId} and kept the session resumable.`;
    case "new_workflow":
      return "I started a new workflow session for this task and prepared the next collaboration steps.";
    case "direct_reply":
    default:
      return "I can answer directly, or turn this into a workflow when you want broader collaboration.";
  }
}

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

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [session, setSession] = useState<ChatRouteResponse | null>(null);
  const [isRouting, setIsRouting] = useState(false);

  const landing = messages.length === 0;

  const inspector = useMemo(() => {
    if (landing) {
      return null;
    }

    return (
      <Inspector description="Session route, live bindings, and context readiness for the current World conversation." title="Context Inspector">
        <Card description={`Session ${formatSession(session?.sessionId)}`} title="Session" tone="accent" />
        <Card description={formatRoute(session?.route)} title="Route" />
        <Card description="Session memory ， knowledge read ， workflow ready" title="Bindings" />
        <Card description="World can answer directly or promote the thread into a reusable workflow." title="Next Move" />
      </Inspector>
    );
  }, [landing, session]);

  const handleSend = async (nextPrompt?: string) => {
    const value = (nextPrompt ?? prompt).trim();

    if (!value) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: value,
    };

    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    setIsRouting(true);

    try {
      const response = await routeWorldPrompt(value, session?.sessionId);
      setSession(response);
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-world`,
          role: "world",
          content: buildWorldReply(response, value),
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-world-fallback`,
          role: "world",
          content: buildWorldReply(null, value),
        },
      ]);
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
                <NukaLogo className="chat-hero__logo" size={84} />
                <div className="chat-hero__copy">
                  <span className="chat-hero__eyebrow">World Chat</span>
                  <h1>Nuka World</h1>
                  <p>Talk to World and start a new session.</p>
                </div>
              </div>
            ) : (
              <section className="chat-surface" aria-label="World conversation surface">
                <header className="chat-surface__header">
                  <div className="chat-surface__identity">
                    <span className="chat-surface__eyebrow">World Chat</span>
                    <span className="chat-surface__meta">
                      Session {formatSession(session?.sessionId)} ， {formatRoute(session?.route)} ， Tools ready
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
                        <span className="chat-bubble__label">
                          {message.role === "world" ? "World" : "You"}
                        </span>
                        <p className="chat-bubble__content">{message.content}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            )}

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
                  <div className="composer__hint">
                    {landing
                      ? "World can answer directly or turn this into a reusable workflow."
                      : "Quick actions stay attached to the composer, not the transcript."}
                  </div>
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
