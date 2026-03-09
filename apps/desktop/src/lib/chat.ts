import { invoke } from "@tauri-apps/api/core";

export type ChatMode =
  | { kind: "chat_only" }
  | { kind: "create_workflow" }
  | { kind: "specific_workflow"; workflowId: string };

export type WorldRoute =
  | { kind: "direct_reply" }
  | { kind: "existing_workflow"; workflowId: string }
  | { kind: "new_workflow" };

export type ChatSessionSummary = {
  id: string;
  title: string;
  providerId: string | null;
  workflowId: string | null;
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
  mode: ChatMode = { kind: "chat_only" },
): Promise<ChatRouteResponse> {
  return invoke<ChatRouteResponse>("route_world_prompt", { prompt, mode, sessionId });
}
