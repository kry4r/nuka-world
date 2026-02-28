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
  A2ATask,
  A2ATaskDetail,
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
    request<{ status: string; name: string }>("/providers", { method: "POST", body: JSON.stringify(p) }),
  updateProvider: (id: string, p: Partial<ProviderConfig>) =>
    request<{ status: string }>(`/providers/${id}`, { method: "PUT", body: JSON.stringify(p) }),
  deleteProvider: (id: string) =>
    request<{ status: string }>(`/providers/${id}`, { method: "DELETE" }),
  setDefaultProvider: (id: string) =>
    request<{ status: string }>("/providers/default", { method: "PUT", body: JSON.stringify({ id }) }),
  testProvider: (id: string) =>
    request<{ status: string }>(`/providers/${id}/test`, { method: "POST" }),

  // A2A Collaboration
  listA2ATasks: () => request<A2ATask[]>("/a2a/tasks"),
  getA2ATask: (id: string) => request<A2ATaskDetail>(`/a2a/tasks/${id}`),
  createA2ATask: (description: string, maxRounds?: number) =>
    request<A2ATask>("/a2a/tasks", {
      method: "POST",
      body: JSON.stringify({ description, max_rounds: maxRounds || 10 }),
    }),
  confirmA2ATask: (id: string, agents?: string[]) =>
    request<{ status: string }>(`/a2a/tasks/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify(agents ? { agents } : {}),
    }),
  cancelA2ATask: (id: string) =>
    request<{ status: string }>(`/a2a/tasks/${id}/cancel`, { method: "POST" }),

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
