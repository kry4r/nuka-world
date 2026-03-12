import { invoke } from "@tauri-apps/api/core";

export type ProviderRecord = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  hasSecret: boolean;
  secretUpdatedAt: string | null;
  local: boolean;
  enabled: boolean;
};

export async function listProviders(): Promise<ProviderRecord[]> {
  return invoke<ProviderRecord[]>("list_providers");
}

export async function saveProvider(provider: ProviderRecord): Promise<ProviderRecord> {
  return invoke<ProviderRecord>("save_provider", { provider });
}

export async function importProviderFromEnv(): Promise<ProviderRecord> {
  return invoke<ProviderRecord>("import_provider_from_env");
}
