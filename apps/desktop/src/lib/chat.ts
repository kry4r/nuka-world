import { invoke } from "@tauri-apps/api/core";

export type ChatMode = { kind: "direct_chat" };

export type WorldRoute = { kind: "direct_reply" };

export type ChatSessionSummary = {
  id: string;
  title: string;
  providerId: string | null;
  messageCount: number;
};

export type ChatMessage = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type ChatProviderInfo = {
  id: string;
  name: string;
  model: string;
  baseUrl: string;
};

export type ChatContextInfo = {
  attachedAgents: string[];
  attachedKnowledgeLibraries: string[];
};

export type ChatRouteResponse = {
  session: ChatSessionSummary;
  route: WorldRoute;
  messages: ChatMessage[];
  provider: ChatProviderInfo | null;
  context: ChatContextInfo;
};

export async function routeWorldPrompt(
  prompt: string,
  sessionId?: string,
  mode: ChatMode = { kind: "direct_chat" },
): Promise<ChatRouteResponse> {
  return invoke<ChatRouteResponse>("route_world_prompt", { prompt, mode, sessionId });
}
