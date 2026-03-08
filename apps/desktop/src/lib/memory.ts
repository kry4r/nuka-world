import { invoke } from "@tauri-apps/api/core";

export type MemoryScopeRecord = {
  id: string;
  title: string;
  kind: string;
  workflowId: string | null;
  sessionId: string | null;
  agentId: string | null;
};

export type MemoryNodeDetail = {
  id: string;
  title: string;
  kind: string;
  body: string | null;
  relatedIds: string[];
  workflowId: string | null;
  sessionId: string | null;
  agentId: string | null;
};

export async function listMemoryScopes(): Promise<MemoryScopeRecord[]> {
  return invoke<MemoryScopeRecord[]>("list_memory_scopes");
}

export async function listMemoryByWorkflow(workflowId: string): Promise<MemoryScopeRecord[]> {
  return invoke<MemoryScopeRecord[]>("list_memory_by_workflow", { workflowId });
}

export async function getMemoryNodeDetail(nodeId: string): Promise<MemoryNodeDetail | null> {
  return invoke<MemoryNodeDetail | null>("get_memory_node_detail", { nodeId });
}
