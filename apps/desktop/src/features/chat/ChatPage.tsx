import { useState } from "react";
import { routeWorldPrompt, type ChatRouteResponse } from "@/lib/chat";

export function ChatPage() {
  const [prompt, setPrompt] = useState("summarize today's notes");
  const [result, setResult] = useState<ChatRouteResponse | null>(null);

  const handleRoute = async () => {
    const nextResult = await routeWorldPrompt(prompt);
    setResult(nextResult);
  };

  return (
    <section>
      <h2>World Chat</h2>
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      <button type="button" onClick={() => void handleRoute()}>
        Route Prompt
      </button>
      {result ? <p>Session: {result.sessionId}</p> : null}
      {result ? <p>Route: {result.route.kind}</p> : null}
      {result?.route.kind === "existing_workflow" ? (
        <p>Workflow: {result.route.workflowId}</p>
      ) : null}
    </section>
  );
}
