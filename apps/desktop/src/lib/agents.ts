import { invoke } from "@tauri-apps/api/core";

export type ToolBindingSetResponse = {
  names: string[];
};

export type AgentArchetypeRecord = {
  id: string;
  title: string;
  family: string;
  domainFocus: string;
  objectivePattern: string;
  communicationStyle: string;
  defaultToolPosture: string;
  memoryPosture: string;
  escalationPosture: string;
  safetyPosture: string;
  outputContract: string;
};

export type AgentRecord = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  providerId: string | null;
  archetype?: AgentArchetypeRecord;
  toolNames: string[];
};

export async function defaultAgentToolBindings(): Promise<ToolBindingSetResponse> {
  return invoke<ToolBindingSetResponse>("default_agent_tool_bindings");
}

export async function listAgents(): Promise<AgentRecord[]> {
  return invoke<AgentRecord[]>("list_agents");
}

export async function saveAgent(agent: AgentRecord): Promise<AgentRecord> {
  return invoke<AgentRecord>("save_agent", { agent });
}

export async function deleteAgent(agentId: string): Promise<void> {
  return invoke<void>("delete_agent", { agentId });
}

export async function generateAgentDraft(prompt: string): Promise<AgentRecord> {
  return invoke<AgentRecord>("generate_agent_draft", { prompt });
}
