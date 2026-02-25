import type {
  Agent,
  ExecuteResult,
  Schedule,
  GrowthProfile,
  AgentStateResponse,
  Team,
  BroadcastMessage,
  WorldStatus,
  ProviderConfig,
  SkillConfig,
  AdapterConfig,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () => request<{ status: string }>("/health"),

  // Agents
  listAgents: () => request<Agent[]>("/agents"),
  getAgent: (id: string) => request<Agent>(`/agents/${id}`),
  createAgent: (agent: Partial<Agent>) =>
    request<Agent>("/agents", { method: "POST", body: JSON.stringify(agent) }),
  chatWithAgent: (id: string, message: string) =>
    request<ExecuteResult>(`/agents/${id}/chat`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  // Agent world data
  getAgentSchedule: (id: string) => request<Schedule>(`/agents/${id}/schedule`),
  getAgentGrowth: (id: string) => request<GrowthProfile>(`/agents/${id}/growth`),
  getAgentState: (id: string) => request<AgentStateResponse>(`/agents/${id}/state`),

  // Teams
  listTeams: () => request<Team[]>("/teams"),
  createTeam: (team: Partial<Team>) =>
    request<Team>("/teams", { method: "POST", body: JSON.stringify(team) }),
  chatWithTeam: (teamID: string, message: string) =>
    request<ExecuteResult>(`/teams/${teamID}/chat`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  // Broadcast
  broadcast: (msg: BroadcastMessage) =>
    request<{ status: string }>("/broadcast", {
      method: "POST",
      body: JSON.stringify(msg),
    }),

  // World
  worldStatus: () => request<WorldStatus>("/world/status"),

  // Providers
  listProviders: () => request<ProviderConfig[]>("/providers"),
  addProvider: (p: Partial<ProviderConfig>) =>
    request<ProviderConfig>("/providers", { method: "POST", body: JSON.stringify(p) }),

  // Skills
  listSkills: () => request<SkillConfig[]>("/skills"),
  addSkill: (s: Partial<SkillConfig>) =>
    request<SkillConfig>("/skills", { method: "POST", body: JSON.stringify(s) }),
  removeSkill: (name: string) =>
    request<{ status: string }>(`/skills/${encodeURIComponent(name)}`, { method: "DELETE" }),

  // Adapters
  listAdapters: () => request<AdapterConfig[]>("/adapters"),
  saveAdapter: (a: Partial<AdapterConfig>) =>
    request<AdapterConfig>("/adapters", { method: "POST", body: JSON.stringify(a) }),
};
