import { invoke } from "@tauri-apps/api/core";
import type { ChatMessage, ChatSessionSummary } from "./chat";
import type { TeamRunRecord } from "./team";

export type WorkspaceSessionLineage = {
  rootId: string;
  parentId: string | null;
  branchSnapshotId: string | null;
  branchedFromItemId: string | null;
  branchDepth: number;
};

export type WorkspaceSessionSnapshot = {
  id: string;
  anchorId: string;
  anchorKind: string;
  anchorIndex: number;
  title: string;
  excerpt: string;
  createdAt: string;
};

export type WorkspaceSessionSummary = {
  id: string;
  kind: "direct_chat" | "team_run";
  title: string;
  status: string;
  updatedAt: string;
  lineage?: WorkspaceSessionLineage;
};

export type WorkspaceSessionDetail =
  | {
      kind: "direct_chat";
      session: ChatSessionSummary;
      messages: ChatMessage[];
      lineage?: WorkspaceSessionLineage;
      snapshots?: WorkspaceSessionSnapshot[];
    }
  | {
      kind: "team_run";
      run: TeamRunRecord;
      lineage?: WorkspaceSessionLineage;
      snapshots?: WorkspaceSessionSnapshot[];
    };

export async function listWorkspaceSessions(): Promise<WorkspaceSessionSummary[]> {
  return invoke<WorkspaceSessionSummary[]>("list_workspace_sessions");
}

export async function loadWorkspaceSession(
  sessionId: string,
  kind: WorkspaceSessionSummary["kind"],
): Promise<WorkspaceSessionDetail | null> {
  return invoke<WorkspaceSessionDetail | null>("load_workspace_session", {
    sessionId,
    kind,
  });
}

export async function createWorkspaceSessionBranch(
  sessionId: string,
  kind: WorkspaceSessionSummary["kind"],
  anchorId: string,
  branchTitle: string,
): Promise<WorkspaceSessionDetail> {
  return invoke<WorkspaceSessionDetail>("create_workspace_session_branch", {
    sessionId,
    kind,
    anchorId,
    branchTitle,
  });
}
