import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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

export type ChatRouteResponse = {
  session: ChatSessionSummary;
  messages: ChatMessage[];
  provider: ChatProviderInfo | null;
  routing: ProviderRoutingState | null;
  context: ChatContextInfo;
};

type ChatStreamEventPayload = {
  requestId: string;
  kind: "started" | "delta" | "completed" | "error";
  session: ChatSessionSummary | null;
  provider: ChatProviderInfo | null;
  routing: ProviderRoutingState | null;
  delta: string | null;
  response: ChatRouteResponse | null;
  error: string | null;
};

export type RouteWorldPromptStreamHandlers = {
  onStarted?: (event: {
    session: ChatSessionSummary;
    provider: ChatProviderInfo | null;
    routing: ProviderRoutingState | null;
  }) => void;
  onDelta?: (event: {
    content: string;
  }) => void;
};

export async function routeWorldPrompt(
  prompt: string,
  sessionId?: string,
  routing?: ProviderRoutingRequest,
): Promise<ChatRouteResponse> {
  return invoke<ChatRouteResponse>("route_world_prompt", { prompt, sessionId, routing });
}

function nextChatStreamRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `chat-stream-${Date.now()}`;
}

export async function routeWorldPromptStream(
  prompt: string,
  handlers: RouteWorldPromptStreamHandlers,
  sessionId?: string,
  routing?: ProviderRoutingRequest,
): Promise<ChatRouteResponse> {
  const requestId = nextChatStreamRequestId();

  return new Promise<ChatRouteResponse>(async (resolve, reject) => {
    let settled = false;

    const unlisten = await listen<ChatStreamEventPayload>(
      "nuka://chat-stream",
      (event) => {
        const payload = event.payload;
        if (payload.requestId !== requestId) {
          return;
        }

        switch (payload.kind) {
          case "started":
            if (payload.session) {
              handlers.onStarted?.({
                session: payload.session,
                provider: payload.provider,
                routing: payload.routing,
              });
            }
            break;
          case "delta":
            if (payload.delta) {
              handlers.onDelta?.({
                content: payload.delta,
              });
            }
            break;
          case "completed":
            settled = true;
            void unlisten();
            if (!payload.response) {
              reject(new Error("chat stream completed without a response"));
              return;
            }
            resolve(payload.response);
            break;
          case "error":
            settled = true;
            void unlisten();
            reject(new Error(payload.error ?? "chat stream failed"));
            break;
        }
      },
    );

    try {
      await invoke("route_world_prompt_stream", {
        requestId,
        prompt,
        sessionId,
        routing,
      });
    } catch (error) {
      if (!settled) {
        settled = true;
        void unlisten();
        reject(error);
      }
    }
  });
}
