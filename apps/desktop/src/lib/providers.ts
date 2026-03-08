import { invoke } from "@tauri-apps/api/core";

export type ProviderRecord = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  local: boolean;
  enabled: boolean;
};

export async function listProviders(): Promise<ProviderRecord[]> {
  return invoke<ProviderRecord[]>("list_providers");
}
