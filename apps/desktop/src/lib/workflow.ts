import { invoke } from "@tauri-apps/api/core";

export type WorkflowEvent =
  | { kind: "user_message"; id: string; content: string }
  | { kind: "assistant_message"; id: string; content: string }
  | { kind: "node_event"; id: string; title: string; status: string; detail?: string };

export type WorkflowStartOrigin = {
  sourceSessionId: string;
  sourceMode: "create_workflow" | "specific_workflow";
};

export type WorkflowDefinition = {
  id: string;
  label: string;
  title: string;
  description: string;
  purpose: string;
  inputs: Array<{
    id: string;
    label: string;
    placeholder: string;
  }>;
};

export const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  {
    id: "workflow-research-brief",
    label: "Research Brief",
    title: "Research Brief",
    description: "Agent + shared memory map",
    purpose: "Collect the goal, frame the research task, and begin a real workflow session.",
    inputs: [
      {
        id: "goal",
        label: "Goal",
        placeholder: "What should this workflow produce?",
      },
    ],
  },
  {
    id: "workflow-release-notes",
    label: "Release Notes",
    title: "Release Notes",
    description: "3 agents - review mode",
    purpose: "Capture the release objective and start a session with the supplied notes scope.",
    inputs: [
      {
        id: "releaseScope",
        label: "Release scope",
        placeholder: "Which changes belong in this release?",
      },
    ],
  },
  {
    id: "workflow-customer-triage",
    label: "Customer Triage",
    title: "Customer Triage",
    description: "5 agents - tool-heavy",
    purpose: "Route incoming issues into a real workflow session with the selected triage goal.",
    inputs: [
      {
        id: "issueSummary",
        label: "Issue summary",
        placeholder: "What customer problem should the workflow analyze?",
      },
    ],
  },
];

export type WorkflowSessionResponse = {
  sessionId: string;
  workflowId: string;
  inputs: Record<string, string>;
  origin?: WorkflowStartOrigin | null;
  status: string;
  events: WorkflowEvent[];
};

export type WorkflowLaunchIntent =
  | {
      kind: "open_workflow_lobby";
      prompt: string;
      origin: WorkflowStartOrigin;
    }
  | {
      kind: "open_workflow_room";
      workflowId: string;
      prompt: string;
      origin: WorkflowStartOrigin;
    };

export async function startWorkflowSession(
  workflowId: string,
  inputs?: Record<string, string>,
  origin?: WorkflowStartOrigin,
): Promise<WorkflowSessionResponse> {
  return invoke<WorkflowSessionResponse>("start_workflow_session", {
    workflowId,
    inputs,
    origin,
  });
}

export async function continueWorkflowSession(
  sessionId: string,
  prompt: string,
): Promise<WorkflowSessionResponse> {
  return invoke<WorkflowSessionResponse>("continue_workflow_session", { sessionId, prompt });
}

export function seedWorkflowInputs(
  workflowId: string,
  prompt: string,
): Record<string, string> {
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    return {};
  }

  const primaryInputId =
    WORKFLOW_DEFINITIONS.find((workflow) => workflow.id === workflowId)?.inputs[0]?.id ??
    "goal";

  return {
    [primaryInputId]: trimmedPrompt,
  };
}

export function formatWorkflowSourceSession(sessionId: string) {
  return `Came from World chat session ${sessionId.slice(0, 8)}...`;
}
