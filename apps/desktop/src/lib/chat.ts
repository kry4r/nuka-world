import { invoke } from "@tauri-apps/api/core";

export type WorldRoute = "direct_reply" | "existing_workflow" | "new_workflow";

export async function routeWorldPrompt(prompt: string): Promise<WorldRoute> {
  return invoke<WorldRoute>("route_world_prompt", { prompt });
}
