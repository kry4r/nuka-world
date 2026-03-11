use crate::tool::{AgentToolBinding, ToolUsePolicy};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TeamStatus {
    Ready,
    Archived,
    Deleted,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TeamRunStatus {
    Active,
    WaitingForAgents,
    WaitingForUser,
    BudgetPaused,
    Completed,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TeamRunAgentStatus {
    Thinking,
    Drafting,
    Reviewing,
    Waiting,
    Blocked,
    Done,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunCharter {
    pub goal: String,
    pub success_criteria: String,
    pub output_format: String,
    pub current_phase: String,
    pub max_rounds: usize,
    pub max_active_agents_per_round: usize,
    pub max_messages_per_agent_per_round: usize,
    pub budget_policy: String,
    pub stop_conditions: Vec<String>,
}

impl RunCharter {
    pub fn default_for_goal(goal: impl Into<String>) -> Self {
        Self {
            goal: goal.into(),
            success_criteria: String::new(),
            output_format: "checkpoint_summary".to_string(),
            current_phase: "planning".to_string(),
            max_rounds: 6,
            max_active_agents_per_round: 3,
            max_messages_per_agent_per_round: 2,
            budget_policy: "pause_on_budget_warning".to_string(),
            stop_conditions: vec![
                "completed".to_string(),
                "waiting_for_user".to_string(),
                "budget_paused".to_string(),
            ],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamAgent {
    pub id: String,
    pub team_id: String,
    pub name: String,
    pub role: String,
    pub responsibility: String,
    pub system_prompt: String,
    pub tool_bindings: Vec<AgentToolBinding>,
    pub tool_use_policy: ToolUsePolicy,
    pub order_hint: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Team {
    pub id: String,
    pub name: String,
    pub goal: String,
    pub summary: String,
    pub success_criteria: String,
    pub coordination_policy: String,
    pub created_at: String,
    pub updated_at: String,
    pub status: TeamStatus,
    pub agents: Vec<TeamAgent>,
}

impl Team {
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        goal: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            goal: goal.into(),
            summary: String::new(),
            success_criteria: String::new(),
            coordination_policy: String::new(),
            created_at: String::new(),
            updated_at: String::new(),
            status: TeamStatus::Ready,
            agents: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamRunAgent {
    pub id: String,
    pub run_id: String,
    pub source_team_agent_id: Option<String>,
    pub name: String,
    pub role: String,
    pub responsibility: String,
    pub system_prompt: String,
    pub tool_bindings: Vec<AgentToolBinding>,
    pub tool_use_policy: ToolUsePolicy,
    pub status: TeamRunAgentStatus,
    pub current_work: String,
    pub last_tool_activity: Option<String>,
    pub joined_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamRunEvent {
    pub id: String,
    pub run_id: String,
    pub kind: String,
    pub agent_id: Option<String>,
    pub title: String,
    pub content: String,
    pub status: Option<String>,
    pub tool_name: Option<String>,
    pub tool_call_id: Option<String>,
    pub tool_target: Option<String>,
    pub sequence: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamRun {
    pub id: String,
    pub team_id: String,
    pub title: String,
    pub goal: String,
    pub status: TeamRunStatus,
    pub current_phase: String,
    pub lead_agent_id: Option<String>,
    pub charter: RunCharter,
    pub created_at: String,
    pub updated_at: String,
    pub agents: Vec<TeamRunAgent>,
    pub events: Vec<TeamRunEvent>,
}
