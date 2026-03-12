import { invoke } from "@tauri-apps/api/core";
import type { ProviderRoutingRequest, ProviderRoutingState } from "./chat";

export type ToolBindingRecord = {
  toolId: string;
  allowed: boolean;
  adapterKind: string;
  purpose: string;
  costClass: string;
};

export type ToolUsePolicyRecord = {
  maxCallsPerRound: number | null;
  summarizeOutput: boolean;
};

export type TeamAgentRecord = {
  id: string;
  teamId: string;
  name: string;
  role: string;
  responsibility: string;
  systemPrompt: string;
  toolBindings: ToolBindingRecord[];
  toolUsePolicy: ToolUsePolicyRecord;
  orderHint: number;
  createdAt: string;
  updatedAt: string;
};

export type TeamAgentAssignmentRecord = {
  id: string;
  teamId: string;
  agentId: string;
  enabled: boolean;
  orderHint: number;
  promptOverride: string | null;
  permissionOverrideJson: string;
  createdAt: string;
  updatedAt: string;
};

export type TeamRecord = {
  id: string;
  name: string;
  goal: string;
  summary: string;
  promptConstraints: string;
  permissionPolicy: string;
  successCriteria: string;
  coordinationPolicy: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  agents: TeamAgentRecord[];
  agentAssignments: TeamAgentAssignmentRecord[];
};

export type RunCharterRecord = {
  goal: string;
  successCriteria: string;
  outputFormat: string;
  currentPhase: string;
  maxRounds: number;
  maxActiveAgentsPerRound: number;
  maxMessagesPerAgentPerRound: number;
  budgetPolicy: string;
  stopConditions: string[];
};

export type TeamRunAgentRecord = {
  id: string;
  runId: string;
  sourceAgentId: string | null;
  sourceTeamAssignmentId: string | null;
  sourceTeamAgentId: string | null;
  name: string;
  role: string;
  responsibility: string;
  systemPrompt: string;
  toolBindings: ToolBindingRecord[];
  toolUsePolicy: ToolUsePolicyRecord;
  status: string;
  currentWork: string;
  lastToolActivity: string | null;
  joinedAt: string;
};

export type TeamRunEventRecord = {
  id: string;
  runId: string;
  kind: string;
  agentId: string | null;
  title: string;
  content: string;
  status: string | null;
  toolName: string | null;
  toolCallId: string | null;
  toolTarget: string | null;
  sequence: number;
  createdAt: string;
};

export type TeamRunRecord = {
  id: string;
  teamId: string;
  title: string;
  goal: string;
  status: string;
  currentPhase: string;
  leadAgentId: string | null;
  charter: RunCharterRecord;
  createdAt: string;
  updatedAt: string;
  routing: ProviderRoutingState | null;
  agents: TeamRunAgentRecord[];
  events: TeamRunEventRecord[];
};

export type RuntimeAgentInput = {
  name: string;
  role: string;
  responsibility: string;
  systemPrompt: string;
  toolBindings: ToolBindingRecord[];
  toolUsePolicy: ToolUsePolicyRecord;
  joinReason: string;
};

export async function createTeamFromGoal(goal: string): Promise<TeamRecord> {
  return invoke<TeamRecord>("create_team_from_goal", { goal });
}

export async function listTeams(): Promise<TeamRecord[]> {
  return invoke<TeamRecord[]>("list_teams");
}

export async function loadTeam(teamId: string): Promise<TeamRecord | null> {
  return invoke<TeamRecord | null>("load_team", { teamId });
}

export async function updateTeam(team: TeamRecord): Promise<TeamRecord> {
  return invoke<TeamRecord>("update_team", { team });
}

export async function deleteTeam(teamId: string): Promise<void> {
  return invoke("delete_team", { teamId });
}

export async function startTeamRun(
  teamId: string,
  routing?: ProviderRoutingRequest,
): Promise<TeamRunRecord> {
  return invoke<TeamRunRecord>("start_team_run", { teamId, routing });
}

export async function loadTeamRun(runId: string): Promise<TeamRunRecord | null> {
  return invoke<TeamRunRecord | null>("load_team_run", { runId });
}

export async function continueTeamRun(
  runId: string,
  prompt: string,
  routing?: ProviderRoutingRequest,
): Promise<TeamRunRecord> {
  return invoke<TeamRunRecord>("continue_team_run", { runId, prompt, routing });
}

export async function addTeamRunAgent(
  runId: string,
  agentSpec: RuntimeAgentInput,
): Promise<TeamRunRecord> {
  return invoke<TeamRunRecord>("add_team_run_agent", { runId, agentSpec });
}
