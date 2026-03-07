import { useMemo, useState } from "react";
import { NukaLogo } from "@/components/brand/NukaLogo";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { routeWorldPrompt, type ChatRouteResponse } from "@/lib/chat";

type ChatMessage = {
  id: string;
  role: "user" | "world";
  content: string;
};

const QUICK_CHOICES = [
  "Summarize today’s notes",
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
      <Inspector description="Current world route, session state, and context bindings." title="Context Inspector">
        <Card description={session?.sessionId ?? "Pending"} title="Session" />
        <Card description={session?.route.kind ?? "direct_reply"} title="Route" />
        <Card description="Session memory · knowledge read · workflow ready" title="Bindings" />
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
    <div className="page-layout">
      <SectionHeader
        meta={landing ? "Landing state and composer" : "Context, routing, and conversation state"}
        status={landing ? "Landing" : "Active"}
        tag="Chat"
        title={landing ? "Start a World Chat" : "World Chat"}
      />

      <div className="page-layout__body">
        <div className="page-layout__main">
          {landing ? (
            <div className="landing-state">
              <NukaLogo className="landing-state__logo" size={84} />
              <h2>Nuka</h2>
              <p>
                A calm desktop world for chat, workflows, memory, and connected knowledge.
              </p>
            </div>
          ) : (
            <Card className="chat-feed" tone="soft">
              {messages.map((message) => (
                <article className={`chat-bubble chat-bubble--${message.role}`} key={message.id}>
                  {message.content}
                </article>
              ))}
            </Card>
          )}

          <div className="composer">
            {landing ? null : (
              <div className="composer__choices">
                {QUICK_CHOICES.map((choice) => (
                  <button
                    className="composer__choice"
                    key={choice}
                    onClick={() => {
                      setPrompt(choice);
                    }}
                    type="button"
                  >
                    {choice}
                  </button>
                ))}
              </div>
            )}

            <div className="composer__bar">
              <textarea
                className="composer__input"
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask World to reason, route, or start a workflow..."
                value={prompt}
              />
              <button className="composer__send" onClick={() => void handleSend()} type="button">
                {isRouting ? "..." : "Send"}
              </button>
            </div>
          </div>
        </div>

        {inspector}
      </div>
    </div>
  );
}
