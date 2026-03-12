import { invoke } from "@tauri-apps/api/core";

export type ChatSessionSummary = {
  id: string;
  title: string;
  providerId: string | null;
  messageCount: number;
  routing: ProviderRoutingState | null;
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

export type ProviderRoutingRequest = {
  requestedProviderId: string | null;
  requestedModel: string | null;
};

export type ProviderRoutingState = {
  requestedProviderId: string | null;
  requestedModel: string | null;
  effectiveProviderId: string;
  effectiveModel: string;
  fallbackProviderId: string | null;
  failoverReason: string | null;
};

export type ChatContextInfo = {
  attachedAgents: string[];
  attachedKnowledgeLibraries: string[];
};

export type ChatPromptResponse = {
  sessionId: string;
  runId: string | null;
  session: ChatSessionSummary;
  messages: ChatMessage[];
  output: string;
  exitStatus: string;
  provider: ChatProviderInfo | null;
  routing: ProviderRoutingState | null;
  context: ChatContextInfo;
};

export async function sendChatPrompt(
  prompt: string,
  sessionId?: string,
  routing?: ProviderRoutingRequest,
): Promise<ChatPromptResponse> {
  return invoke<ChatPromptResponse>("send_chat_prompt", { prompt, sessionId, routing });
}
