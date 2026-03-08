import { invoke } from "@tauri-apps/api/core";

export type WorkflowSessionResponse = {
  sessionId: string;
  workflowId: string;
  inputs: Record<string, string>;
  status: string;
};

export async function startWorkflowSession(
  workflowId: string,
  inputs?: Record<string, string>,
): Promise<WorkflowSessionResponse> {
  return invoke<WorkflowSessionResponse>("start_workflow_session", { workflowId, inputs });
}
