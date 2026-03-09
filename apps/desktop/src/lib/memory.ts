import { invoke } from "@tauri-apps/api/core";

export type MemoryGraphNode = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
};

export type MemoryGraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  relation: string;
};

export type MemoryGraph = {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
};

export async function loadMemoryGraph(): Promise<MemoryGraph> {
  return invoke<MemoryGraph>("load_memory_graph");
}

export async function updateMemoryNode(
  nodeId: string,
  title: string,
  body: string | null,
): Promise<MemoryGraphNode> {
  return invoke<MemoryGraphNode>("update_memory_node", { nodeId, title, body });
}

export async function deleteMemoryNode(nodeId: string): Promise<void> {
  return invoke("delete_memory_node", { nodeId });
}

export async function createMemoryEdge(
  edgeId: string,
  sourceId: string,
  targetId: string,
  relation: string,
): Promise<MemoryGraphEdge> {
  return invoke<MemoryGraphEdge>("create_memory_edge", {
    edgeId,
    sourceId,
    targetId,
    relation,
  });
}

export async function deleteMemoryEdge(edgeId: string): Promise<void> {
  return invoke("delete_memory_edge", { edgeId });
}
