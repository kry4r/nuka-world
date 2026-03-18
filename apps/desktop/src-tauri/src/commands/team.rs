use crate::app_state::AppState;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolBindingRecord {
    pub tool_id: String,
    pub allowed: bool,
    pub adapter_kind: String,
    pub purpose: String,
    pub cost_class: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolUsePolicyRecord {
    pub max_calls_per_round: Option<usize>,
    pub summarize_output: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamAgentRecord {
    pub id: String,
    pub team_id: String,
    pub name: String,
    pub role: String,
    pub responsibility: String,
    pub system_prompt: String,
    pub tool_bindings: Vec<ToolBindingRecord>,
    pub tool_use_policy: ToolUsePolicyRecord,
    pub order_hint: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamAgentAssignmentRecord {
    pub id: String,
    pub team_id: String,
    pub agent_id: String,
    pub enabled: bool,
    pub order_hint: i64,
    pub prompt_override: Option<String>,
    pub permission_override_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRecord {
    pub id: String,
    pub name: String,
    pub goal: String,
    pub summary: String,
    pub prompt_constraints: String,
    pub permission_policy: String,
    pub success_criteria: String,
    pub coordination_policy: String,
    pub created_at: String,
    pub updated_at: String,
    pub status: String,
    pub agents: Vec<TeamAgentRecord>,
    pub agent_assignments: Vec<TeamAgentAssignmentRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCharterRecord {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRunAgentRecord {
    pub id: String,
    pub run_id: String,
    pub source_agent_id: Option<String>,
    pub source_team_assignment_id: Option<String>,
    pub source_team_agent_id: Option<String>,
    pub name: String,
    pub role: String,
    pub responsibility: String,
    pub system_prompt: String,
    pub tool_bindings: Vec<ToolBindingRecord>,
    pub tool_use_policy: ToolUsePolicyRecord,
    pub status: String,
    pub current_work: String,
    pub last_tool_activity: Option<String>,
    pub joined_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRunEventRecord {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRunRecord {
    pub id: String,
    pub team_id: String,
    pub title: String,
    pub goal: String,
    pub status: String,
    pub current_phase: String,
    pub lead_agent_id: Option<String>,
    pub charter: RunCharterRecord,
    pub created_at: String,
    pub updated_at: String,
    pub routing: Option<super::chat::ProviderRoutingResponse>,
    pub agents: Vec<TeamRunAgentRecord>,
    pub events: Vec<TeamRunEventRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAgentInput {
    pub name: String,
    pub role: String,
    pub responsibility: String,
    pub system_prompt: String,
    pub tool_bindings: Vec<ToolBindingRecord>,
    pub tool_use_policy: ToolUsePolicyRecord,
    pub join_reason: String,
}

#[tauri::command]
pub async fn create_team_from_goal(
    goal: String,
    state: tauri::State<'_, AppState>,
) -> Result<TeamRecord, String> {
    create_team_from_goal_inner(goal, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn list_teams(state: tauri::State<'_, AppState>) -> Result<Vec<TeamRecord>, String> {
    list_teams_inner(&state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn load_team(
    team_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<TeamRecord>, String> {
    load_team_inner(team_id, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_team(
    team: TeamRecord,
    state: tauri::State<'_, AppState>,
) -> Result<TeamRecord, String> {
    update_team_inner(team, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_team(team_id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    delete_team_inner(team_id, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn start_team_run(
    team_id: String,
    routing: Option<super::chat::ProviderRoutingInput>,
    prompt: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<TeamRunRecord, String> {
    start_team_run_with_prompt_inner(team_id, routing, prompt, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn load_team_run(
    run_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<TeamRunRecord>, String> {
    load_team_run_inner(run_id, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn continue_team_run(
    run_id: String,
    prompt: String,
    routing: Option<super::chat::ProviderRoutingInput>,
    state: tauri::State<'_, AppState>,
) -> Result<TeamRunRecord, String> {
    continue_team_run_inner(run_id, prompt, routing, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn retry_team_run(
    run_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<TeamRunRecord, String> {
    retry_team_run_inner(run_id, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn resume_team_run(
    run_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<TeamRunRecord, String> {
    resume_team_run_inner(run_id, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn add_team_run_agent(
    run_id: String,
    agent_spec: RuntimeAgentInput,
    state: tauri::State<'_, AppState>,
) -> Result<TeamRunRecord, String> {
    add_team_run_agent_inner(run_id, agent_spec, &state)
        .await
        .map_err(|error| error.to_string())
}

pub(crate) async fn create_team_from_goal_inner(
    goal: String,
    state: &AppState,
) -> anyhow::Result<TeamRecord> {
    Ok(TeamRecord::from(
        state.team_service().create_team_from_goal(&goal).await?,
    ))
}

async fn list_teams_inner(state: &AppState) -> anyhow::Result<Vec<TeamRecord>> {
    Ok(state
        .team_service()
        .list_teams()
        .await?
        .into_iter()
        .map(TeamRecord::from)
        .collect())
}

async fn load_team_inner(team_id: String, state: &AppState) -> anyhow::Result<Option<TeamRecord>> {
    Ok(state
        .team_service()
        .load_team(&team_id)
        .await?
        .map(TeamRecord::from))
}

async fn update_team_inner(team: TeamRecord, state: &AppState) -> anyhow::Result<TeamRecord> {
    let team_id = team.id.clone();
    state.team_service().update_team(team.try_into()?).await?;
    state
        .team_service()
        .load_team(&team_id)
        .await?
        .map(TeamRecord::from)
        .ok_or_else(|| anyhow::anyhow!("team disappeared after update"))
}

async fn delete_team_inner(team_id: String, state: &AppState) -> anyhow::Result<()> {
    state.team_service().delete_team(&team_id).await
}

pub(crate) async fn start_team_run_inner(
    team_id: String,
    routing: Option<super::chat::ProviderRoutingInput>,
    state: &AppState,
) -> anyhow::Result<TeamRunRecord> {
    start_team_run_with_prompt_inner(team_id, routing, None, state).await
}

async fn start_team_run_with_prompt_inner(
    team_id: String,
    routing: Option<super::chat::ProviderRoutingInput>,
    prompt: Option<String>,
    state: &AppState,
) -> anyhow::Result<TeamRunRecord> {
    let prompt = prompt
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let route_request = routing.map(nuka_domain::provider::ProviderRouteRequest::from);
    let run = match prompt {
        Some(prompt) => {
            state
                .team_run_service()
                .start_team_run_with_initial_prompt(&team_id, prompt, route_request)
                .await?
        }
        None => {
            state
                .team_run_service()
                .start_team_run_with_route(&team_id, route_request)
                .await?
        }
    };

    state
        .memory_service()
        .handle_runtime_event(nuka_runtime::runtime_events::RuntimeEvent::TeamRunStarted {
            run_id: run.id.clone(),
            team_id: run.team_id.clone(),
            prompt: prompt.unwrap_or(run.goal.as_str()).to_string(),
        })
        .await?;

    Ok(TeamRunRecord::from(run))
}

async fn load_team_run_inner(
    run_id: String,
    state: &AppState,
) -> anyhow::Result<Option<TeamRunRecord>> {
    Ok(state
        .team_run_service()
        .load_team_run(&run_id)
        .await?
        .map(TeamRunRecord::from))
}

async fn continue_team_run_inner(
    run_id: String,
    prompt: String,
    routing: Option<super::chat::ProviderRoutingInput>,
    state: &AppState,
) -> anyhow::Result<TeamRunRecord> {
    let run = state
        .team_run_service()
        .continue_team_run_with_route(
            &run_id,
            &prompt,
            routing.map(nuka_domain::provider::ProviderRouteRequest::from),
        )
        .await?;

    state
        .memory_service()
        .handle_runtime_event(
            nuka_runtime::runtime_events::RuntimeEvent::TeamRunRoundCompleted {
                run_id: run.id.clone(),
                team_id: run.team_id.clone(),
                prompt: prompt.clone(),
            },
        )
        .await?;

    Ok(TeamRunRecord::from(run))
}

async fn add_team_run_agent_inner(
    run_id: String,
    agent_spec: RuntimeAgentInput,
    state: &AppState,
) -> anyhow::Result<TeamRunRecord> {
    Ok(TeamRunRecord::from(
        state
            .team_run_service()
            .add_runtime_agent(&run_id, agent_spec.into())
            .await?,
    ))
}

async fn retry_team_run_inner(run_id: String, state: &AppState) -> anyhow::Result<TeamRunRecord> {
    Ok(TeamRunRecord::from(
        state.team_run_service().retry_team_run(&run_id).await?,
    ))
}

async fn resume_team_run_inner(run_id: String, state: &AppState) -> anyhow::Result<TeamRunRecord> {
    Ok(TeamRunRecord::from(
        state.team_run_service().resume_team_run(&run_id).await?,
    ))
}

impl From<nuka_domain::tool::AgentToolBinding> for ToolBindingRecord {
    fn from(value: nuka_domain::tool::AgentToolBinding) -> Self {
        Self {
            tool_id: value.tool_id,
            allowed: value.allowed,
            adapter_kind: tool_adapter_kind_as_str(&value.adapter_kind).to_string(),
            purpose: value.purpose,
            cost_class: tool_cost_class_as_str(&value.cost_class).to_string(),
        }
    }
}

impl TryFrom<ToolBindingRecord> for nuka_domain::tool::AgentToolBinding {
    type Error = anyhow::Error;

    fn try_from(value: ToolBindingRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            tool_id: value.tool_id,
            allowed: value.allowed,
            adapter_kind: parse_tool_adapter_kind(&value.adapter_kind)?,
            purpose: value.purpose,
            cost_class: parse_tool_cost_class(&value.cost_class)?,
        })
    }
}

impl From<nuka_domain::tool::ToolUsePolicy> for ToolUsePolicyRecord {
    fn from(value: nuka_domain::tool::ToolUsePolicy) -> Self {
        Self {
            max_calls_per_round: value.max_calls_per_round,
            summarize_output: value.summarize_output,
        }
    }
}

impl From<ToolUsePolicyRecord> for nuka_domain::tool::ToolUsePolicy {
    fn from(value: ToolUsePolicyRecord) -> Self {
        Self {
            max_calls_per_round: value.max_calls_per_round,
            summarize_output: value.summarize_output,
        }
    }
}

impl From<nuka_domain::team::TeamAgent> for TeamAgentRecord {
    fn from(value: nuka_domain::team::TeamAgent) -> Self {
        Self {
            id: value.id,
            team_id: value.team_id,
            name: value.name,
            role: value.role,
            responsibility: value.responsibility,
            system_prompt: value.system_prompt,
            tool_bindings: value
                .tool_bindings
                .into_iter()
                .map(ToolBindingRecord::from)
                .collect(),
            tool_use_policy: ToolUsePolicyRecord::from(value.tool_use_policy),
            order_hint: value.order_hint,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

impl TryFrom<TeamAgentRecord> for nuka_domain::team::TeamAgent {
    type Error = anyhow::Error;

    fn try_from(value: TeamAgentRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: value.id,
            team_id: value.team_id,
            name: value.name,
            role: value.role,
            responsibility: value.responsibility,
            system_prompt: value.system_prompt,
            tool_bindings: value
                .tool_bindings
                .into_iter()
                .map(nuka_domain::tool::AgentToolBinding::try_from)
                .collect::<Result<Vec<_>, _>>()?,
            tool_use_policy: value.tool_use_policy.into(),
            order_hint: value.order_hint,
            created_at: value.created_at,
            updated_at: value.updated_at,
        })
    }
}

impl From<nuka_domain::team::TeamAgentAssignment> for TeamAgentAssignmentRecord {
    fn from(value: nuka_domain::team::TeamAgentAssignment) -> Self {
        Self {
            id: value.id,
            team_id: value.team_id,
            agent_id: value.agent_id,
            enabled: value.enabled,
            order_hint: value.order_hint,
            prompt_override: value.prompt_override,
            permission_override_json: value.permission_override_json,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

impl From<TeamAgentAssignmentRecord> for nuka_domain::team::TeamAgentAssignment {
    fn from(value: TeamAgentAssignmentRecord) -> Self {
        Self {
            id: value.id,
            team_id: value.team_id,
            agent_id: value.agent_id,
            enabled: value.enabled,
            order_hint: value.order_hint,
            prompt_override: value.prompt_override,
            permission_override_json: value.permission_override_json,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

impl From<nuka_domain::team::Team> for TeamRecord {
    fn from(value: nuka_domain::team::Team) -> Self {
        Self {
            id: value.id,
            name: value.name,
            goal: value.goal,
            summary: value.summary,
            prompt_constraints: value.prompt_constraints,
            permission_policy: value.permission_policy,
            success_criteria: value.success_criteria,
            coordination_policy: value.coordination_policy,
            created_at: value.created_at,
            updated_at: value.updated_at,
            status: team_status_as_str(&value.status).to_string(),
            agents: value
                .agents
                .into_iter()
                .map(TeamAgentRecord::from)
                .collect(),
            agent_assignments: value
                .agent_assignments
                .into_iter()
                .map(TeamAgentAssignmentRecord::from)
                .collect(),
        }
    }
}

impl TryFrom<TeamRecord> for nuka_domain::team::Team {
    type Error = anyhow::Error;

    fn try_from(value: TeamRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: value.id,
            name: value.name,
            goal: value.goal,
            summary: value.summary,
            prompt_constraints: value.prompt_constraints,
            permission_policy: value.permission_policy,
            success_criteria: value.success_criteria,
            coordination_policy: value.coordination_policy,
            created_at: value.created_at,
            updated_at: value.updated_at,
            status: parse_team_status(&value.status)?,
            agents: value
                .agents
                .into_iter()
                .map(nuka_domain::team::TeamAgent::try_from)
                .collect::<Result<Vec<_>, _>>()?,
            agent_assignments: value
                .agent_assignments
                .into_iter()
                .map(nuka_domain::team::TeamAgentAssignment::from)
                .collect(),
        })
    }
}

impl From<nuka_domain::team::RunCharter> for RunCharterRecord {
    fn from(value: nuka_domain::team::RunCharter) -> Self {
        Self {
            goal: value.goal,
            success_criteria: value.success_criteria,
            output_format: value.output_format,
            current_phase: value.current_phase,
            max_rounds: value.max_rounds,
            max_active_agents_per_round: value.max_active_agents_per_round,
            max_messages_per_agent_per_round: value.max_messages_per_agent_per_round,
            budget_policy: value.budget_policy,
            stop_conditions: value.stop_conditions,
        }
    }
}

impl From<nuka_domain::team::TeamRunAgent> for TeamRunAgentRecord {
    fn from(value: nuka_domain::team::TeamRunAgent) -> Self {
        Self {
            id: value.id,
            run_id: value.run_id,
            source_agent_id: value.source_agent_id,
            source_team_assignment_id: value.source_team_assignment_id,
            source_team_agent_id: value.source_team_agent_id,
            name: value.name,
            role: value.role,
            responsibility: value.responsibility,
            system_prompt: value.system_prompt,
            tool_bindings: value
                .tool_bindings
                .into_iter()
                .map(ToolBindingRecord::from)
                .collect(),
            tool_use_policy: ToolUsePolicyRecord::from(value.tool_use_policy),
            status: team_run_agent_status_as_str(&value.status).to_string(),
            current_work: value.current_work,
            last_tool_activity: value.last_tool_activity,
            joined_at: value.joined_at,
        }
    }
}

impl From<nuka_domain::team::TeamRunEvent> for TeamRunEventRecord {
    fn from(value: nuka_domain::team::TeamRunEvent) -> Self {
        Self {
            id: value.id,
            run_id: value.run_id,
            kind: value.kind,
            agent_id: value.agent_id,
            title: value.title,
            content: value.content,
            status: value.status,
            tool_name: value.tool_name,
            tool_call_id: value.tool_call_id,
            tool_target: value.tool_target,
            sequence: value.sequence,
            created_at: value.created_at,
        }
    }
}

impl From<nuka_domain::team::TeamRun> for TeamRunRecord {
    fn from(value: nuka_domain::team::TeamRun) -> Self {
        Self {
            id: value.id,
            team_id: value.team_id,
            title: value.title,
            goal: value.goal,
            status: team_run_status_as_str(&value.status).to_string(),
            current_phase: value.current_phase,
            lead_agent_id: value.lead_agent_id,
            charter: RunCharterRecord::from(value.charter),
            created_at: value.created_at,
            updated_at: value.updated_at,
            routing: value
                .routing
                .map(super::chat::ProviderRoutingResponse::from),
            agents: value
                .agents
                .into_iter()
                .map(TeamRunAgentRecord::from)
                .collect(),
            events: value
                .events
                .into_iter()
                .map(TeamRunEventRecord::from)
                .collect(),
        }
    }
}

impl From<RuntimeAgentInput> for nuka_runtime::team_run_service::RuntimeAgentSpec {
    fn from(value: RuntimeAgentInput) -> Self {
        Self {
            name: value.name,
            role: value.role,
            responsibility: value.responsibility,
            system_prompt: value.system_prompt,
            tool_bindings: value
                .tool_bindings
                .into_iter()
                .map(|binding| {
                    nuka_domain::tool::AgentToolBinding::try_from(binding)
                        .expect("runtime agent tool binding should parse")
                })
                .collect(),
            tool_use_policy: value.tool_use_policy.into(),
            join_reason: value.join_reason,
        }
    }
}

fn tool_adapter_kind_as_str(kind: &nuka_domain::tool::ToolAdapterKind) -> &'static str {
    match kind {
        nuka_domain::tool::ToolAdapterKind::Mcp => "mcp",
        nuka_domain::tool::ToolAdapterKind::Cli => "cli",
        nuka_domain::tool::ToolAdapterKind::IntegratedAgent => "integrated_agent",
    }
}

fn parse_tool_adapter_kind(kind: &str) -> anyhow::Result<nuka_domain::tool::ToolAdapterKind> {
    match kind {
        "mcp" | "Mcp" => Ok(nuka_domain::tool::ToolAdapterKind::Mcp),
        "cli" | "Cli" => Ok(nuka_domain::tool::ToolAdapterKind::Cli),
        "integrated_agent" | "IntegratedAgent" => {
            Ok(nuka_domain::tool::ToolAdapterKind::IntegratedAgent)
        }
        other => anyhow::bail!("unknown tool adapter kind: {other}"),
    }
}

fn tool_cost_class_as_str(cost: &nuka_domain::tool::ToolCostClass) -> &'static str {
    match cost {
        nuka_domain::tool::ToolCostClass::Low => "low",
        nuka_domain::tool::ToolCostClass::Medium => "medium",
        nuka_domain::tool::ToolCostClass::High => "high",
    }
}

fn parse_tool_cost_class(cost: &str) -> anyhow::Result<nuka_domain::tool::ToolCostClass> {
    match cost {
        "low" | "Low" => Ok(nuka_domain::tool::ToolCostClass::Low),
        "medium" | "Medium" => Ok(nuka_domain::tool::ToolCostClass::Medium),
        "high" | "High" => Ok(nuka_domain::tool::ToolCostClass::High),
        other => anyhow::bail!("unknown tool cost class: {other}"),
    }
}

fn team_status_as_str(status: &nuka_domain::team::TeamStatus) -> &'static str {
    match status {
        nuka_domain::team::TeamStatus::Ready => "ready",
        nuka_domain::team::TeamStatus::Archived => "archived",
        nuka_domain::team::TeamStatus::Deleted => "deleted",
    }
}

fn parse_team_status(status: &str) -> anyhow::Result<nuka_domain::team::TeamStatus> {
    match status {
        "ready" | "Ready" => Ok(nuka_domain::team::TeamStatus::Ready),
        "archived" | "Archived" => Ok(nuka_domain::team::TeamStatus::Archived),
        "deleted" | "Deleted" => Ok(nuka_domain::team::TeamStatus::Deleted),
        other => anyhow::bail!("unknown team status: {other}"),
    }
}

fn team_run_status_as_str(status: &nuka_domain::team::TeamRunStatus) -> &'static str {
    match status {
        nuka_domain::team::TeamRunStatus::Queued => "queued",
        nuka_domain::team::TeamRunStatus::Active => "active",
        nuka_domain::team::TeamRunStatus::WaitingForAgents => "waiting_for_agents",
        nuka_domain::team::TeamRunStatus::WaitingForUser => "waiting_for_user",
        nuka_domain::team::TeamRunStatus::BudgetPaused => "budget_paused",
        nuka_domain::team::TeamRunStatus::Blocked => "blocked",
        nuka_domain::team::TeamRunStatus::Completed => "completed",
        nuka_domain::team::TeamRunStatus::Failed => "failed",
    }
}

fn team_run_agent_status_as_str(status: &nuka_domain::team::TeamRunAgentStatus) -> &'static str {
    match status {
        nuka_domain::team::TeamRunAgentStatus::Thinking => "thinking",
        nuka_domain::team::TeamRunAgentStatus::Drafting => "drafting",
        nuka_domain::team::TeamRunAgentStatus::Reviewing => "reviewing",
        nuka_domain::team::TeamRunAgentStatus::Waiting => "waiting",
        nuka_domain::team::TeamRunAgentStatus::Blocked => "blocked",
        nuka_domain::team::TeamRunAgentStatus::Done => "done",
    }
}

#[cfg(test)]
mod tests {
    async fn configure_default_provider(state: &crate::app_state::AppState) {
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Local",
            "http://localhost:11434/v1",
            "",
            "gpt-oss",
        );
        let provider_id = provider.id.clone();
        state
            .provider_service()
            .save_provider(provider)
            .await
            .unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();
    }

    async fn configure_provider_chain(
        state: &crate::app_state::AppState,
        default_provider: nuka_domain::provider::ProviderConfig,
        fallback_provider: nuka_domain::provider::ProviderConfig,
    ) {
        state
            .provider_service()
            .save_provider(default_provider.clone())
            .await
            .unwrap();
        state
            .provider_service()
            .save_provider(fallback_provider)
            .await
            .unwrap();
        state
            .provider_service()
            .set_default_provider(&default_provider.id)
            .await
            .unwrap();
        state
            .settings_service()
            .save_state_value(
                "settings.providers",
                r#"{"fallbackProviderId":"provider-fallback","connectionChecks":true}"#,
            )
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn team_commands_create_and_start_run() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        configure_default_provider(&state).await;

        let team = super::create_team_from_goal_inner("Ship the release".to_string(), &state)
            .await
            .unwrap();
        let run = super::start_team_run_inner(team.id.clone(), None, &state)
            .await
            .unwrap();

        assert_eq!(run.team_id, team.id);
        assert!(team.agent_assignments.len() >= 2);
        assert!(run
            .agents
            .iter()
            .all(|agent| agent.source_agent_id.is_some()));
        assert!(run
            .agents
            .iter()
            .all(|agent| agent.source_team_assignment_id.is_some()));
    }

    #[tokio::test]
    async fn team_commands_record_team_memory_scope_and_graph_links() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        configure_default_provider(&state).await;

        let team = super::create_team_from_goal_inner("Ship the release".to_string(), &state)
            .await
            .unwrap();
        let run = super::start_team_run_with_prompt_inner(
            team.id.clone(),
            None,
            Some("Create an initial team memory note".to_string()),
            &state,
        )
        .await
        .unwrap();

        let updated_run = super::continue_team_run_inner(
            run.id.clone(),
            "Record the follow-up review outcome".to_string(),
            None,
            &state,
        )
        .await
        .unwrap();

        let scope_id = format!("team:{}", team.id);
        let scopes = state.memory_service().list_scopes().await.unwrap();
        let graph = state
            .memory_service()
            .load_graph_for_scope(Some(&scope_id))
            .await
            .unwrap();

        assert!(
            scopes.iter().any(|scope| {
                scope.id == scope_id
                    && scope.workflow_id.as_deref() == Some(scope_id.as_str())
                    && scope.session_id.as_deref() == Some(updated_run.id.as_str())
            }),
            "expected a persisted team memory scope for the active run"
        );
        assert!(
            graph.nodes.len() >= 2,
            "expected multiple persisted memory nodes for the team scope"
        );
        assert!(
            !graph.edges.is_empty(),
            "expected the team memory graph to preserve at least one relation edge"
        );
    }

    #[tokio::test]
    async fn team_commands_expose_effective_routing_metadata_after_fallback() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let broken_provider = nuka_domain::provider::ProviderConfig {
            id: "provider-broken".to_string(),
            name: "Broken".to_string(),
            kind: nuka_domain::provider::ProviderKind::OpenAiCompatible,
            base_url: "http://127.0.0.1:17882/v1".to_string(),
            token: String::new(),
            model: String::new(),
            enabled: true,
            secret_ref: None,
            secret_present: false,
            secret_updated_at: None,
        };
        let fallback_provider = nuka_domain::provider::ProviderConfig {
            id: "provider-fallback".to_string(),
            name: "Fallback".to_string(),
            kind: nuka_domain::provider::ProviderKind::OpenAiCompatible,
            base_url: "http://127.0.0.1:17882/v1".to_string(),
            token: String::new(),
            model: "gpt-oss-fallback".to_string(),
            enabled: true,
            secret_ref: None,
            secret_present: false,
            secret_updated_at: None,
        };
        configure_provider_chain(&state, broken_provider, fallback_provider).await;

        let team = super::create_team_from_goal_inner("Ship the release".to_string(), &state)
            .await
            .unwrap();
        let run = super::start_team_run_inner(team.id.clone(), None, &state)
            .await
            .unwrap();
        let response_json = serde_json::to_value(&run).unwrap();

        assert_eq!(
            response_json["routing"]["effectiveProviderId"],
            "provider-fallback"
        );
        assert_eq!(
            response_json["routing"]["effectiveModel"],
            "gpt-oss-fallback"
        );
        assert_eq!(
            response_json["routing"]["fallbackProviderId"],
            "provider-fallback"
        );
        assert_eq!(response_json["routing"]["failoverReason"], "missing_model");
    }
}
