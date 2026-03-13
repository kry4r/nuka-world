use nuka_integrations::providers::{
    openai::OpenAiCompatibleProvider,
    types::OpenAiChatMessage,
    ChatCompletionProvider,
};

const TEAM_RUN_COMPACTION_EVENT_THRESHOLD: usize = 8;
const TEAM_RUN_COMPACTION_RECENT_WINDOW: usize = 5;

#[derive(Debug, Clone)]
pub struct RuntimeAgentSpec {
    pub name: String,
    pub role: String,
    pub responsibility: String,
    pub system_prompt: String,
    pub tool_bindings: Vec<nuka_domain::tool::AgentToolBinding>,
    pub tool_use_policy: nuka_domain::tool::ToolUsePolicy,
    pub join_reason: String,
}

#[derive(Debug, Clone)]
pub struct TeamRunService {
    pool: sqlx::SqlitePool,
    provider_service: crate::providers::ProvidersService,
    provider_client: OpenAiCompatibleProvider,
    seed_provider: Option<nuka_domain::provider::ProviderConfig>,
    seed_team: Option<nuka_domain::team::Team>,
    seed_completion: Option<String>,
}

impl TeamRunService {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        let provider_service = crate::providers::ProvidersService::new(pool.clone());
        Self::new_with_provider_service(pool, provider_service)
    }

    pub fn new_with_provider_service(
        pool: sqlx::SqlitePool,
        provider_service: crate::providers::ProvidersService,
    ) -> Self {
        Self {
            pool,
            provider_service,
            provider_client: OpenAiCompatibleProvider::default(),
            seed_provider: None,
            seed_team: None,
            seed_completion: None,
        }
    }

    pub fn new_for_test_with_provider() -> Self {
        let mut service =
            Self::new_for_test_with_seeded_completion(crate::settings_service::test_pool());
        service.seed_provider = Some(nuka_domain::provider::ProviderConfig::openai_compatible(
            "Local",
            "http://localhost:11434/v1",
            "",
            "gpt-oss",
        ));
        service.seed_team = Some(sample_seed_team());
        service
    }

    pub fn new_for_test_with_seeded_completion(pool: sqlx::SqlitePool) -> Self {
        Self::new_for_test_with_seeded_completion_and_provider_service(
            pool.clone(),
            crate::providers::ProvidersService::new(pool),
        )
    }

    pub fn new_for_test_with_seeded_completion_and_provider_service(
        pool: sqlx::SqlitePool,
        provider_service: crate::providers::ProvidersService,
    ) -> Self {
        let mut service = Self::new_with_provider_service(pool, provider_service);
        service.seed_completion = Some("Seeded meeting output".to_string());
        service
    }

    pub async fn start_team_run(
        &self,
        team_id: &str,
    ) -> anyhow::Result<nuka_domain::team::TeamRun> {
        self.start_team_run_with_route(team_id, None).await
    }

    pub async fn start_team_run_with_route(
        &self,
        team_id: &str,
        route_request: Option<nuka_domain::provider::ProviderRouteRequest>,
    ) -> anyhow::Result<nuka_domain::team::TeamRun> {
        nuka_storage::migrations::run(&self.pool).await?;
        self.ensure_seed_provider().await?;
        self.ensure_seed_team().await?;

        let resolved_route = self.provider_service.resolve_route(route_request.as_ref()).await?;
        let team = nuka_storage::teams::TeamRepository::new(self.pool.clone())
            .load_team(team_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("unknown team: {team_id}"))?;

        let mut charter = nuka_domain::team::RunCharter::default_for_goal(team.goal.clone());
        charter.success_criteria = team.success_criteria.clone();
        charter.current_phase = "kickoff".to_string();

        let mut run = snapshot_team_into_run(&team, charter);
        run.routing = Some(resolved_route.routing.clone());
        self.maybe_run_provider_preflight(&resolved_route.provider, &mut run)
            .await?;
        execute_round(
            &self.provider_client,
            &resolved_route.provider,
            self.seed_completion.as_deref(),
            &mut run,
            "Kick off the team run",
        )
        .await?;

        let repo = nuka_storage::team_runs::TeamRunRepository::new(self.pool.clone());
        self.maybe_compact_run_events(&repo, &mut run).await?;
        repo.create_run(run.clone()).await?;
        repo.load_run(&run.id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("persisted run disappeared after save"))
    }

    pub async fn continue_team_run(
        &self,
        run_id: &str,
        prompt: &str,
    ) -> anyhow::Result<nuka_domain::team::TeamRun> {
        self.continue_team_run_with_route(run_id, prompt, None).await
    }

    pub async fn continue_team_run_with_route(
        &self,
        run_id: &str,
        prompt: &str,
        route_request: Option<nuka_domain::provider::ProviderRouteRequest>,
    ) -> anyhow::Result<nuka_domain::team::TeamRun> {
        nuka_storage::migrations::run(&self.pool).await?;
        self.ensure_seed_provider().await?;

        let repo = nuka_storage::team_runs::TeamRunRepository::new(self.pool.clone());
        let mut run = repo
            .load_run_live(run_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("unknown team run: {run_id}"))?;
        let requested_route = route_request.or_else(|| {
            run.routing
                .as_ref()
                .map(|routing| nuka_domain::provider::ProviderRouteRequest {
                    requested_provider_id: routing.requested_provider_id.clone(),
                    requested_model: routing.requested_model.clone(),
                })
        });
        let resolved_route = self
            .provider_service
            .resolve_route(requested_route.as_ref())
            .await?;

        run.routing = Some(resolved_route.routing.clone());
        run.status = nuka_domain::team::TeamRunStatus::Active;
        run.events.push(nuka_domain::team::TeamRunEvent {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: run.id.clone(),
            kind: "user_instruction".to_string(),
            agent_id: None,
            title: "User follow-up".to_string(),
            content: prompt.to_string(),
            status: Some("queued".to_string()),
            tool_name: None,
            tool_call_id: None,
            tool_target: None,
            sequence: next_sequence(&run.events),
            created_at: String::new(),
        });

        self.maybe_run_provider_preflight(&resolved_route.provider, &mut run)
            .await?;
        execute_round(
            &self.provider_client,
            &resolved_route.provider,
            self.seed_completion.as_deref(),
            &mut run,
            prompt,
        )
        .await?;

        self.maybe_compact_run_events(&repo, &mut run).await?;
        repo.save_run(run.clone()).await?;
        repo.load_run(&run.id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("persisted run disappeared after update"))
    }

    pub async fn add_runtime_agent(
        &self,
        run_id: &str,
        spec: RuntimeAgentSpec,
    ) -> anyhow::Result<nuka_domain::team::TeamRun> {
        nuka_storage::migrations::run(&self.pool).await?;

        let repo = nuka_storage::team_runs::TeamRunRepository::new(self.pool.clone());
        let mut run = repo
            .load_run_live(run_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("unknown team run: {run_id}"))?;

        run.agents.push(nuka_domain::team::TeamRunAgent {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: run.id.clone(),
            source_agent_id: None,
            source_team_assignment_id: None,
            source_team_agent_id: None,
            name: spec.name.clone(),
            role: spec.role.clone(),
            responsibility: spec.responsibility.clone(),
            system_prompt: spec.system_prompt.clone(),
            tool_bindings: spec.tool_bindings.clone(),
            tool_use_policy: spec.tool_use_policy,
            status: nuka_domain::team::TeamRunAgentStatus::Waiting,
            current_work: format!("Joined run: {}", spec.join_reason),
            last_tool_activity: None,
            joined_at: String::new(),
        });
        run.events.push(nuka_domain::team::TeamRunEvent {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: run.id.clone(),
            kind: "runtime_agent_joined".to_string(),
            agent_id: run.agents.last().map(|agent| agent.id.clone()),
            title: format!("{} joined the run", spec.name),
            content: spec.join_reason,
            status: Some("active".to_string()),
            tool_name: None,
            tool_call_id: None,
            tool_target: None,
            sequence: next_sequence(&run.events),
            created_at: String::new(),
        });

        repo.save_run(run.clone()).await?;
        repo.load_run(&run.id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("persisted run disappeared after add-agent"))
    }

    pub async fn load_team_run(
        &self,
        run_id: &str,
    ) -> anyhow::Result<Option<nuka_domain::team::TeamRun>> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::team_runs::TeamRunRepository::new(self.pool.clone())
            .load_run(run_id)
            .await
    }

    async fn ensure_seed_provider(&self) -> anyhow::Result<()> {
        let Some(provider) = &self.seed_provider else {
            return Ok(());
        };

        if self.provider_service.list_providers().await?.is_empty() {
            self.provider_service.save_provider(provider.clone()).await?;
            self.provider_service
                .set_default_provider(&provider.id)
                .await?;
        }

        Ok(())
    }

    async fn connection_checks_enabled(&self) -> anyhow::Result<bool> {
        load_connection_checks_enabled(&self.pool).await
    }

    async fn maybe_compact_run_events(
        &self,
        repo: &nuka_storage::team_runs::TeamRunRepository,
        run: &mut nuka_domain::team::TeamRun,
    ) -> anyhow::Result<()> {
        if run.events.len() <= TEAM_RUN_COMPACTION_EVENT_THRESHOLD {
            return Ok(());
        }

        let compact_count = run
            .events
            .len()
            .saturating_sub(TEAM_RUN_COMPACTION_RECENT_WINDOW);
        if compact_count == 0 {
            return Ok(());
        }

        let compacted_events = run.events[..compact_count].to_vec();
        let compacted_ids = compacted_events
            .iter()
            .map(|event| event.id.clone())
            .collect::<Vec<_>>();
        let compacted_sequence = compacted_events
            .last()
            .map(|event| event.sequence)
            .unwrap_or_default();

        repo.compact_events(
            &run.id,
            &compacted_ids,
            compacted_sequence,
            &summarize_team_run_events(&compacted_events),
        )
        .await?;
        run.events = run.events[compact_count..].to_vec();
        Ok(())
    }

    async fn maybe_run_provider_preflight(
        &self,
        provider: &nuka_domain::provider::ProviderConfig,
        run: &mut nuka_domain::team::TeamRun,
    ) -> anyhow::Result<()> {
        if !self.connection_checks_enabled().await? {
            return Ok(());
        }

        push_provider_preflight_event(run, provider);
        Ok(())
    }

    async fn ensure_seed_team(&self) -> anyhow::Result<()> {
        let Some(team) = &self.seed_team else {
            return Ok(());
        };

        let repo = nuka_storage::teams::TeamRepository::new(self.pool.clone());
        if repo.load_team(&team.id).await?.is_none() {
            repo.save_team(team.clone()).await?;
        }

        Ok(())
    }
}

async fn execute_round(
    provider_client: &OpenAiCompatibleProvider,
    provider: &nuka_domain::provider::ProviderConfig,
    seed_completion: Option<&str>,
    run: &mut nuka_domain::team::TeamRun,
    prompt: &str,
) -> anyhow::Result<()> {
    let selected_indexes = select_active_agent_indexes(&run.agents, run.charter.max_active_agents_per_round);
    if let Some(index) = selected_indexes.first().copied() {
        run.lead_agent_id = Some(run.agents[index].id.clone());
    }

    for (index, agent) in run.agents.iter_mut().enumerate() {
        if selected_indexes.contains(&index) {
            agent.status = if Some(&index) == selected_indexes.first() {
                nuka_domain::team::TeamRunAgentStatus::Thinking
            } else {
                nuka_domain::team::TeamRunAgentStatus::Drafting
            };
            agent.current_work = "Drafting position card".to_string();
        } else {
            agent.status = nuka_domain::team::TeamRunAgentStatus::Waiting;
            agent.current_work = "Waiting for coordinator".to_string();
        }
    }

    let agenda = format!(
        "Round agenda: focus on {} and synthesize a checkpoint with at most {} agents.",
        prompt, run.charter.max_active_agents_per_round
    );
    run.current_phase = "analysis".to_string();
    run.events.push(nuka_domain::team::TeamRunEvent {
        id: uuid::Uuid::new_v4().to_string(),
        run_id: run.id.clone(),
        kind: "round_agenda".to_string(),
        agent_id: run.lead_agent_id.clone(),
        title: "Coordinator agenda".to_string(),
        content: agenda.clone(),
        status: Some("active".to_string()),
        tool_name: None,
        tool_call_id: None,
        tool_target: None,
        sequence: next_sequence(&run.events),
        created_at: String::new(),
    });

    let mut position_cards = Vec::new();
    for index in &selected_indexes {
        let agent = &mut run.agents[*index];
        let content = completion_or_seed(
            provider_client,
            provider,
            seed_completion,
            vec![
                OpenAiChatMessage {
                    role: "system".to_string(),
                    content: agent.system_prompt.clone(),
                },
                OpenAiChatMessage::user(format!(
                    "Goal: {}\nResponsibility: {}\nAgenda: {}\nProvide a concise position card with evidence and recommendation.",
                    run.goal, agent.responsibility, agenda
                )),
            ],
            &format!("{} recommends a focused next step for: {}", agent.name, prompt),
        )
        .await?;
        agent.current_work = "Position card delivered".to_string();
        position_cards.push(format!("{}: {}", agent.name, content));
        run.events.push(nuka_domain::team::TeamRunEvent {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: run.id.clone(),
            kind: "position_card".to_string(),
            agent_id: Some(agent.id.clone()),
            title: format!("{} position card", agent.name),
            content,
            status: Some("completed".to_string()),
            tool_name: None,
            tool_call_id: None,
            tool_target: None,
            sequence: next_sequence(&run.events),
            created_at: String::new(),
        });
    }

    let summary = completion_or_seed(
        provider_client,
        provider,
        seed_completion,
        vec![OpenAiChatMessage::user(format!(
            "Goal: {}\nPrompt: {}\nPositions:\n{}\nWrite a short checkpoint summary and next step.",
            run.goal,
            prompt,
            position_cards.join("\n")
        ))],
        &format!("Checkpoint summary for: {}", prompt),
    )
    .await?;
    run.events.push(nuka_domain::team::TeamRunEvent {
        id: uuid::Uuid::new_v4().to_string(),
        run_id: run.id.clone(),
        kind: "checkpoint_summary".to_string(),
        agent_id: run.lead_agent_id.clone(),
        title: "Checkpoint summary".to_string(),
        content: summary,
        status: Some("completed".to_string()),
        tool_name: None,
        tool_call_id: None,
        tool_target: None,
        sequence: next_sequence(&run.events),
        created_at: String::new(),
    });

    for (index, agent) in run.agents.iter_mut().enumerate() {
        if selected_indexes.contains(&index) {
            agent.status = nuka_domain::team::TeamRunAgentStatus::Done;
            agent.current_work = "Completed current round".to_string();
        }
    }

    run.status = nuka_domain::team::TeamRunStatus::WaitingForUser;
    Ok(())
}

async fn completion_or_seed(
    provider_client: &OpenAiCompatibleProvider,
    provider: &nuka_domain::provider::ProviderConfig,
    seed_completion: Option<&str>,
    messages: Vec<OpenAiChatMessage>,
    fallback: &str,
) -> anyhow::Result<String> {
    match seed_completion {
        Some(seed) => Ok(format!("{seed}: {fallback}")),
        None => Ok(provider_client
            .complete_chat(provider, messages)
            .await?
            .choices
            .first()
            .map(|choice| choice.message.content.clone())
            .unwrap_or_else(|| fallback.to_string())),
    }
}

fn snapshot_team_into_run(
    team: &nuka_domain::team::Team,
    charter: nuka_domain::team::RunCharter,
) -> nuka_domain::team::TeamRun {
    let uses_assignments = !team.agent_assignments.is_empty();

    nuka_domain::team::TeamRun {
        id: uuid::Uuid::new_v4().to_string(),
        team_id: team.id.clone(),
        title: format!("{} Run", team.name),
        goal: team.goal.clone(),
        status: nuka_domain::team::TeamRunStatus::Active,
        current_phase: charter.current_phase.clone(),
        lead_agent_id: None,
        charter,
        created_at: String::new(),
        updated_at: String::new(),
        routing: None,
        agents: team
            .agents
            .iter()
            .filter_map(|agent| {
                let assignment = team
                    .agent_assignments
                    .iter()
                    .find(|assignment| assignment.order_hint == agent.order_hint);

                if uses_assignments {
                    match assignment {
                        Some(assignment) if assignment.enabled => {}
                        _ => return None,
                    }
                }

                Some(nuka_domain::team::TeamRunAgent {
                    id: uuid::Uuid::new_v4().to_string(),
                    run_id: String::new(),
                    source_agent_id: assignment.map(|item| item.agent_id.clone()),
                    source_team_assignment_id: assignment.map(|item| item.id.clone()),
                    source_team_agent_id: Some(agent.id.clone()),
                    name: agent.name.clone(),
                    role: agent.role.clone(),
                    responsibility: agent.responsibility.clone(),
                    system_prompt: agent.system_prompt.clone(),
                    tool_bindings: agent.tool_bindings.clone(),
                    tool_use_policy: agent.tool_use_policy.clone(),
                    status: nuka_domain::team::TeamRunAgentStatus::Waiting,
                    current_work: "Waiting for coordinator".to_string(),
                    last_tool_activity: None,
                    joined_at: String::new(),
                })
            })
            .collect(),
        events: vec![nuka_domain::team::TeamRunEvent {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: String::new(),
            kind: "run_started".to_string(),
            agent_id: None,
            title: "Team run started".to_string(),
            content: format!("Started run from team {}", team.name),
            status: Some("active".to_string()),
            tool_name: None,
            tool_call_id: None,
            tool_target: None,
            sequence: 1,
            created_at: String::new(),
        }],
    }
}

fn select_active_agent_indexes(
    agents: &[nuka_domain::team::TeamRunAgent],
    limit: usize,
) -> Vec<usize> {
    agents
        .iter()
        .enumerate()
        .take(limit.max(1))
        .map(|(index, _)| index)
        .collect()
}

fn next_sequence(events: &[nuka_domain::team::TeamRunEvent]) -> i64 {
    events.iter().map(|event| event.sequence).max().unwrap_or(0) + 1
}

fn summarize_team_run_events(events: &[nuka_domain::team::TeamRunEvent]) -> String {
    let lines = events
        .iter()
        .map(|event| {
            format!(
                "- {} / {}: {}",
                event.kind,
                event.title,
                excerpt(&event.content, 96)
            )
        })
        .collect::<Vec<_>>();
    format!(
        "Compacted earlier team run context ({} events):\n{}",
        events.len(),
        lines.join("\n")
    )
}

fn excerpt(content: &str, limit: usize) -> String {
    let mut excerpt = content.trim().replace('\n', " ");
    if excerpt.chars().count() > limit {
        excerpt = excerpt.chars().take(limit).collect::<String>();
        excerpt.push_str("...");
    }
    excerpt
}

fn sample_seed_team() -> nuka_domain::team::Team {
    nuka_domain::team::Team {
        id: "team-release".to_string(),
        name: "Release Team".to_string(),
        goal: "Ship the release cleanly".to_string(),
        summary: "Coordinates release readiness, notes, and final review.".to_string(),
        prompt_constraints: "Stay concise and keep decisions auditable.".to_string(),
        permission_policy: "No destructive tools without explicit approval.".to_string(),
        success_criteria: "Release ships with notes and no unresolved blockers.".to_string(),
        coordination_policy: "Coordinator-led bounded rounds.".to_string(),
        created_at: String::new(),
        updated_at: String::new(),
        status: nuka_domain::team::TeamStatus::Ready,
        agents: vec![
            nuka_domain::team::TeamAgent {
                id: "team-agent-coordinator".to_string(),
                team_id: "team-release".to_string(),
                name: "Coordinator".to_string(),
                role: "Coordinator".to_string(),
                responsibility: "Run the agenda and align the team.".to_string(),
                system_prompt: "Coordinate the meeting, keep rounds bounded, and summarize checkpoints.".to_string(),
                tool_bindings: vec![nuka_domain::tool::AgentToolBinding::allowed_cli(
                    "cli:git-read",
                    "Inspect repository status",
                )],
                tool_use_policy: Default::default(),
                order_hint: 0,
                created_at: String::new(),
                updated_at: String::new(),
            },
            nuka_domain::team::TeamAgent {
                id: "team-agent-writer".to_string(),
                team_id: "team-release".to_string(),
                name: "Release Writer".to_string(),
                role: "Writer".to_string(),
                responsibility: "Draft the release notes.".to_string(),
                system_prompt: "Draft concise release notes and final outputs.".to_string(),
                tool_bindings: vec![nuka_domain::tool::AgentToolBinding::allowed("mcp:filesystem")],
                tool_use_policy: Default::default(),
                order_hint: 1,
                created_at: String::new(),
                updated_at: String::new(),
            },
        ],
        agent_assignments: vec![
            nuka_domain::team::TeamAgentAssignment {
                id: "assign-coordinator".to_string(),
                team_id: "team-release".to_string(),
                agent_id: "agent-coordinator".to_string(),
                enabled: true,
                order_hint: 0,
                prompt_override: None,
                permission_override_json: "{}".to_string(),
                created_at: String::new(),
                updated_at: String::new(),
            },
            nuka_domain::team::TeamAgentAssignment {
                id: "assign-writer".to_string(),
                team_id: "team-release".to_string(),
                agent_id: "agent-writer".to_string(),
                enabled: true,
                order_hint: 1,
                prompt_override: Some("Draft release notes after coordinator summary.".to_string()),
                permission_override_json: "{\"allowHighCost\":false}".to_string(),
                created_at: String::new(),
                updated_at: String::new(),
            },
        ],
    }
}

const PROVIDERS_STATE_KEY: &str = "settings.providers";

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderSettingsState {
    #[serde(default = "default_connection_checks")]
    connection_checks: bool,
}

fn default_connection_checks() -> bool {
    true
}

async fn load_connection_checks_enabled(pool: &sqlx::SqlitePool) -> anyhow::Result<bool> {
    let value = nuka_storage::runtime_state::RuntimeStateRepository::new(pool.clone())
        .get(PROVIDERS_STATE_KEY)
        .await?;

    match value {
        Some(value) => Ok(serde_json::from_str::<ProviderSettingsState>(&value)?.connection_checks),
        None => Ok(true),
    }
}

fn push_provider_preflight_event(
    run: &mut nuka_domain::team::TeamRun,
    provider: &nuka_domain::provider::ProviderConfig,
) {
    let sequence = next_sequence(&run.events);
    run.events.push(nuka_domain::team::TeamRunEvent {
        id: uuid::Uuid::new_v4().to_string(),
        run_id: run.id.clone(),
        kind: "provider_check_passed".to_string(),
        agent_id: None,
        title: "Provider preflight".to_string(),
        content: format!("Connection checks passed for {}.", provider.name),
        status: Some("completed".to_string()),
        tool_name: None,
        tool_call_id: None,
        tool_target: None,
        sequence,
        created_at: String::new(),
    });
}

#[cfg(test)]
mod tests {
    fn sample_runtime_agent() -> super::RuntimeAgentSpec {
        super::RuntimeAgentSpec {
            name: "Verifier".to_string(),
            role: "Reviewer".to_string(),
            responsibility: "Check the final package for missing evidence.".to_string(),
            system_prompt: "Review the output for missing evidence and conflicts.".to_string(),
            tool_bindings: vec![nuka_domain::tool::AgentToolBinding::allowed("mcp:filesystem")],
            tool_use_policy: Default::default(),
            join_reason: "Need a dedicated verification pass".to_string(),
        }
    }

    #[tokio::test]
    async fn team_run_starts_with_charter_agents_and_checkpoint() {
        let runtime = super::TeamRunService::new_for_test_with_provider();
        let run = runtime.start_team_run("team-release").await.unwrap();

        assert_eq!(run.charter.max_active_agents_per_round, 3);
        assert!(!run.agents.is_empty());
        assert!(run
            .agents
            .iter()
            .all(|agent| agent.source_agent_id.is_some()));
        assert!(run
            .agents
            .iter()
            .all(|agent| agent.source_team_assignment_id.is_some()));
        assert!(run.events.iter().any(|event| event.kind == "checkpoint_summary"));
    }

    #[tokio::test]
    async fn team_run_adds_runtime_agent_without_rewriting_existing_agents() {
        let runtime = super::TeamRunService::new_for_test_with_provider();
        let run = runtime.start_team_run("team-release").await.unwrap();
        let updated = runtime
            .add_runtime_agent(&run.id, sample_runtime_agent())
            .await
            .unwrap();

        assert_eq!(updated.agents.len(), run.agents.len() + 1);
        assert_eq!(updated.agents[0].responsibility, run.agents[0].responsibility);
        assert_eq!(
            updated.agents.last().and_then(|agent| agent.source_agent_id.as_ref()),
            None
        );
    }

    #[tokio::test]
    async fn team_run_records_provider_preflight_when_connection_checks_are_enabled() {
        let pool = crate::settings_service::test_pool();
        nuka_storage::migrations::run(&pool).await.unwrap();
        let runtime = super::TeamRunService::new_for_test_with_seeded_completion(pool.clone());
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Local",
            "http://localhost:11434/v1",
            "",
            "gpt-oss",
        );
        let provider_id = provider.id.clone();

        runtime.provider_service.save_provider(provider).await.unwrap();
        runtime
            .provider_service
            .set_default_provider(&provider_id)
            .await
            .unwrap();
        nuka_storage::teams::TeamRepository::new(pool)
            .save_team(super::sample_seed_team())
            .await
            .unwrap();

        let run = runtime.start_team_run("team-release").await.unwrap();

        assert!(run
            .events
            .iter()
            .any(|event| event.kind == "provider_check_passed"));
    }
}
