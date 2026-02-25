export interface SpriteConfig {
  base_sprite: string;
  idle_anim: string;
  work_anim: string;
  think_anim: string;
  palette: string;
}

export interface Persona {
  id: string;
  name: string;
  role: string;
  personality: string;
  sprite: SpriteConfig;
  skills: string[] | null;
  traits: Record<string, number> | null;
  backstory: string;
  system_prompt: string;
}

export interface Agent {
  persona: Persona;
  status: string;
  provider_id: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface ThinkStep {
  type: string;
  content: string;
  timestamp: string;
  tokens_used: number;
}

export interface ThinkingChain {
  id: string;
  agent_id: string;
  steps: ThinkStep[];
  started_at: string;
  duration: number;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ExecuteResult {
  content: string;
  chain: ThinkingChain | null;
  usage: Usage;
}

export interface ScheduleEntry {
  type: string;
  label: string;
  start_hour: number;
  end_hour: number;
}

export interface Schedule {
  agent_id: string;
  entries: ScheduleEntry[];
}

export interface Milestone {
  title: string;
  description: string;
  achieved_at: string;
}

export interface GrowthProfile {
  agent_id: string;
  level: number;
  experience: number;
  schema_count: number;
  memory_count: number;
  skill_scores: Record<string, number>;
  milestones: Milestone[];
}

export interface AgentStateResponse {
  agent_id: string;
  state: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  members: string[];
  strategy: string;
}

export interface BroadcastMessage {
  type: string;
  content: string;
  target?: string;
}

export interface WorldStatus {
  world: string;
  world_time: string;
  agent_count: number;
  agents: Agent[];
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: string;
  endpoint: string;
  api_key: string;
  models: string[];
}

export interface AdapterConfig {
  name: string;
  type: string;
  status: string;
  settings: Record<string, string>;
}

export interface SkillConfig {
  name: string;
  type: string;
  description: string;
  endpoint?: string;
  command?: string;
  status: string;
}
