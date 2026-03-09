import { invoke } from "@tauri-apps/api/core";

export type KnowledgeConnectorRecord = {
  id: string;
  kind: string;
  label: string;
  path: string;
  enabled: boolean;
};

export type KnowledgeEngineSummary = {
  id: string;
  label: string;
  health: string;
  capabilities: string[];
};

export type KnowledgeLibraryRecord = {
  id: string;
  name: string;
  description: string;
  engine: KnowledgeEngineSummary;
  connectors: KnowledgeConnectorRecord[];
  supportedExtensions: string[];
};

export type KnowledgeIndexJobRecord = {
  id: string;
  collectionId: string;
  status: string;
  detail: string | null;
};

export type KnowledgeSearchResult = {
  collectionId: string;
  collectionName: string;
  path: string;
  snippet: string;
};

export async function listKnowledgeLibraries(): Promise<KnowledgeLibraryRecord[]> {
  return invoke<KnowledgeLibraryRecord[]>("list_knowledge_libraries");
}

export async function addFolderConnector(
  collectionId: string,
  path: string,
): Promise<KnowledgeLibraryRecord> {
  return invoke<KnowledgeLibraryRecord>("add_folder_connector", { collectionId, path });
}

export async function rebuildKnowledgeLibrary(collectionId: string): Promise<KnowledgeIndexJobRecord> {
  return invoke<KnowledgeIndexJobRecord>("rebuild_knowledge_library", { collectionId });
}

export async function listIndexJobs(collectionId: string): Promise<KnowledgeIndexJobRecord[]> {
  return invoke<KnowledgeIndexJobRecord[]>("list_index_jobs", { collectionId });
}

export async function searchKnowledge(query: string): Promise<KnowledgeSearchResult[]> {
  return invoke<KnowledgeSearchResult[]>("search_knowledge", { query });
}
