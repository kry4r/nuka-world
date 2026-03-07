import { invoke } from "@tauri-apps/api/core";

export type WorldRoute =
  | { kind: "direct_reply" }
  | { kind: "existing_workflow"; workflowId: string }
  | { kind: "new_workflow" };

export type ChatRouteResponse = {
  sessionId: string;
  route: WorldRoute;
};

export async function routeWorldPrompt(
  prompt: string,
  sessionId?: string,
): Promise<ChatRouteResponse> {
  return invoke<ChatRouteResponse>("route_world_prompt", { prompt, sessionId });
}
