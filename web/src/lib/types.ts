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
  extra?: Record<string, string>;
  is_default?: boolean;
}

// A2A types
export type A2ATaskStatus =
  | "submitted"
  | "planning"
  | "confirmed"
  | "working"
  | "completed"
  | "failed"
  | "canceled";

export interface A2ATask {
  id: string;
  description: string;
  status: A2ATaskStatus;
  proposed_agents: string[];
  confirmed_agents: string[];
  result: string;
  max_rounds: number;
  created_at: string;
  updated_at: string;
}

export interface A2AMessage {
  id: string;
  task_id: string;
  from_agent: string;
  content: string;
  round: number;
  msg_type: string;
  created_at: string;
}

export interface A2ATaskDetail {
  task: A2ATask;
  messages: A2AMessage[];
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
