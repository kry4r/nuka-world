import { invoke } from "@tauri-apps/api/core";

export type ToolBindingSetResponse = {
  names: string[];
};

export type AgentArchetypeRecord = {
  key: string;
  family: string;
  title: string;
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
  toolNames: string[];
  archetype: AgentArchetypeRecord;
};

export type GenerateAgentDraftRequest = {
  prompt: string;
  archetype: AgentArchetypeRecord;
};

const CUSTOM_ARCHETYPE_BASE: AgentArchetypeRecord = {
  key: "custom",
  family: "custom",
  title: "Custom Archetype",
  domainFocus: "",
  objectivePattern: "",
  communicationStyle: "",
  defaultToolPosture: "",
  memoryPosture: "",
  escalationPosture: "",
  safetyPosture: "",
  outputContract: "",
};

export const BUILT_IN_AGENT_ARCHETYPES: AgentArchetypeRecord[] = [
  {
    key: "research-analysis",
    family: "research-analysis",
    title: "Research & Analysis",
    domainFocus: "Research, synthesis, and evidence-backed recommendations.",
    objectivePattern: "Gather context, compare options, and produce a concise brief.",
    communicationStyle: "Calm, cited, and structured.",
    defaultToolPosture: "Use retrieval before generation and keep tool use bounded.",
    memoryPosture: "Retain durable findings and active watch items only.",
    escalationPosture: "Escalate when evidence conflicts or confidence is low.",
    safetyPosture: "Flag missing sources and avoid unsupported claims.",
    outputContract: "Summaries with findings, sources, and next actions.",
  },
  {
    key: "operations-coordination",
    family: "operations-coordination",
    title: "Operations Coordination",
    domainFocus: "Planning, sequencing, and keeping multi-step work on track.",
    objectivePattern: "Break work into milestones, dependencies, and clear owners.",
    communicationStyle: "Operational, concise, and deadline-aware.",
    defaultToolPosture: "Use tools to confirm state, unblock handoffs, and track progress.",
    memoryPosture: "Retain commitments, blockers, and active dependencies.",
    escalationPosture: "Escalate when timing, approvals, or owners are unclear.",
    safetyPosture: "Avoid destructive actions without explicit operator approval.",
    outputContract: "Plans, status summaries, and next-step checklists.",
  },
  {
    key: "household-logistics",
    family: "household-logistics",
    title: "Household Logistics",
    domainFocus: "Household coordination, errands, and personal logistics.",
    objectivePattern: "Turn requests into clear plans with owners, timing, and tradeoffs.",
    communicationStyle: "Direct, practical, and low-friction.",
    defaultToolPosture: "Use only the tools needed to confirm schedules and track tasks.",
    memoryPosture: "Remember routines, constraints, and recurring obligations.",
    escalationPosture: "Escalate when timing, budget, or household constraints conflict.",
    safetyPosture: "Avoid unsafe recommendations and surface missing details early.",
    outputContract: "Action plans, checklists, and concise status updates.",
  },
  {
    key: "travel-planning",
    family: "travel-planning",
    title: "Travel Planning",
    domainFocus: "Trips, itineraries, bookings, and travel contingencies.",
    objectivePattern: "Compare options, optimize timing, and keep plans easy to execute.",
    communicationStyle: "Clear, itinerary-first, and tradeoff-aware.",
    defaultToolPosture: "Use tools to confirm routes, timing, and reservation details.",
    memoryPosture: "Retain traveler preferences, constraints, and open reservations.",
    escalationPosture: "Escalate when policy, budget, or timing tradeoffs need a decision.",
    safetyPosture: "Highlight risky connections, missing documents, or unsafe conditions.",
    outputContract: "Itineraries, booking options, and contingency notes.",
  },
  {
    key: "support-communications",
    family: "support-communications",
    title: "Support & Communications",
    domainFocus: "Support replies, stakeholder updates, and service follow-through.",
    objectivePattern: "Resolve the issue, close the loop, and keep tone aligned to context.",
    communicationStyle: "Empathetic, calm, and concise.",
    defaultToolPosture: "Use tools to confirm facts before sending guidance or updates.",
    memoryPosture: "Retain customer context, commitments, and unresolved issues.",
    escalationPosture: "Escalate when policy, safety, or authority thresholds are reached.",
    safetyPosture: "Avoid overpromising and surface policy limits explicitly.",
    outputContract: "Replies, summaries, and action-oriented follow-ups.",
  },
];

function cloneArchetypeRecord(archetype: AgentArchetypeRecord): AgentArchetypeRecord {
  return { ...archetype };
}

function fallbackArchetypeForAgent(agent: Partial<AgentRecord>): AgentArchetypeRecord {
  return {
    ...CUSTOM_ARCHETYPE_BASE,
    title: agent.name ? `${agent.name} Archetype` : CUSTOM_ARCHETYPE_BASE.title,
    domainFocus: agent.description ?? "",
    outputContract: "Clear outputs matched to the request.",
  };
}

function normalizeArchetype(
  archetype: AgentArchetypeRecord | null | undefined,
  agent: Partial<AgentRecord>,
): AgentArchetypeRecord {
  return cloneArchetypeRecord(archetype ?? fallbackArchetypeForAgent(agent));
}

function normalizeAgentRecord(agent: AgentRecord): AgentRecord {
  return {
    ...agent,
    toolNames: Array.isArray(agent.toolNames) ? [...agent.toolNames] : [],
    archetype: normalizeArchetype(agent.archetype, agent),
  };
}

export function cloneAgentArchetype(archetype: AgentArchetypeRecord): AgentArchetypeRecord {
  return cloneArchetypeRecord(archetype);
}

export function createCustomAgentArchetype(): AgentArchetypeRecord {
  return cloneArchetypeRecord(CUSTOM_ARCHETYPE_BASE);
}

export function defaultAgentArchetype(): AgentArchetypeRecord {
  return cloneArchetypeRecord(BUILT_IN_AGENT_ARCHETYPES[0]);
}

export function findBuiltInAgentArchetype(
  family: string,
): AgentArchetypeRecord | undefined {
  return BUILT_IN_AGENT_ARCHETYPES.find((archetype) => archetype.family === family);
}

export async function defaultAgentToolBindings(): Promise<ToolBindingSetResponse> {
  return invoke<ToolBindingSetResponse>("default_agent_tool_bindings");
}

export async function listAgents(): Promise<AgentRecord[]> {
  const agents = await invoke<AgentRecord[]>("list_agents");
  return agents.map(normalizeAgentRecord);
}

export async function saveAgent(agent: AgentRecord): Promise<AgentRecord> {
  const saved = await invoke<AgentRecord>("save_agent", { agent });
  return normalizeAgentRecord(saved);
}

export async function deleteAgent(agentId: string): Promise<void> {
  return invoke<void>("delete_agent", { agentId });
}

export async function generateAgentDraft(
  request: GenerateAgentDraftRequest,
): Promise<AgentRecord> {
  const draft = await invoke<AgentRecord>("generate_agent_draft", request);
  return normalizeAgentRecord(draft);
}
