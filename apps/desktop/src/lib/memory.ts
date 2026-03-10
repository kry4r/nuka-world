import { invoke } from "@tauri-apps/api/core";

export type MemoryTraceType = "working" | "episodic" | "semantic";

export type MemoryConsolidationState =
  | "none"
  | "candidate"
  | "approved"
  | "rejected"
  | "archived";

export type MemoryGraphNode = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  traceType: MemoryTraceType;
  consolidationState: MemoryConsolidationState;
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

export type MemoryReviewSurface = "chat" | "workflow";

export type MemoryReviewDecision =
  | "promote_semantic"
  | "keep_episodic"
  | "reject";

export type MemoryCandidate = {
  id: string;
  nodeId: string;
  title: string;
  surface: MemoryReviewSurface;
  ownerId: string;
  suggestedSchemaId: string | null;
  confidence: number;
  reason: string;
  evidenceCount: number;
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

export async function listPendingMemoryCandidates(
  surface: MemoryReviewSurface,
  ownerId: string,
): Promise<MemoryCandidate[]> {
  return invoke<MemoryCandidate[]>("list_pending_memory_candidates", {
    surface,
    ownerId,
  });
}

export async function reviewMemoryCandidate(
  candidateId: string,
  decision: MemoryReviewDecision,
): Promise<void> {
  return invoke("review_memory_candidate", { candidateId, decision });
}
