import { invoke } from "@tauri-apps/api/core";
import type { ChatMessage, ChatSessionSummary } from "./chat";
import type { TeamRunRecord } from "./team";

export type WorkspaceSessionSummary = {
  id: string;
  kind: "direct_chat" | "team_run";
  title: string;
  status: string;
  updatedAt: string;
  lineage?: WorkspaceSessionLineage | null;
};

export type WorkspaceSessionLineage = {
  rootId: string;
  parentId: string;
  snapshotId: string;
  anchorId: string;
};

export type WorkspaceSessionDetail =
  | {
      kind: "direct_chat";
      session: ChatSessionSummary;
      messages: ChatMessage[];
    }
  | {
      kind: "team_run";
      run: TeamRunRecord;
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

export async function branchWorkspaceSession(
  sessionId: string,
  kind: WorkspaceSessionSummary["kind"],
  anchorId: string,
): Promise<WorkspaceSessionSummary> {
  return invoke<WorkspaceSessionSummary>("branch_workspace_session", {
    sessionId,
    kind,
    anchorId,
  });
}
