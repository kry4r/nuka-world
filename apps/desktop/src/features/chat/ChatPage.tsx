import { useState } from "react";
import { routeWorldPrompt, type WorldRoute } from "@/lib/chat";

export function ChatPage() {
  const [prompt, setPrompt] = useState("summarize today's notes");
  const [route, setRoute] = useState<WorldRoute | null>(null);

  const handleRoute = async () => {
    const nextRoute = await routeWorldPrompt(prompt);
    setRoute(nextRoute);
  };

  return (
    <section>
      <h2>World Chat</h2>
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      <button type="button" onClick={() => void handleRoute()}>
        Route Prompt
      </button>
      {route ? <p>Route: {route}</p> : null}
    </section>
  );
}
