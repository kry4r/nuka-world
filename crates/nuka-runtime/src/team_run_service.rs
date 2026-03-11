use nuka_integrations::providers::{openai::OpenAiCompatibleProvider, types::OpenAiChatMessage};

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
    provider_client: OpenAiCompatibleProvider,
    seed_provider: Option<nuka_domain::provider::ProviderConfig>,
    seed_team: Option<nuka_domain::team::Team>,
    seed_completion: Option<String>,
}

impl TeamRunService {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self {
            pool,
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
        Self {
            pool,
            provider_client: OpenAiCompatibleProvider::default(),
            seed_provider: None,
            seed_team: None,
            seed_completion: Some("Seeded meeting output".to_string()),
        }
    }

    pub async fn start_team_run(
        &self,
        team_id: &str,
    ) -> anyhow::Result<nuka_domain::team::TeamRun> {
        nuka_storage::migrations::run(&self.pool).await?;
        self.ensure_seed_provider().await?;
        self.ensure_seed_team().await?;

        let provider = crate::providers::ProvidersService::new(self.pool.clone())
            .resolve_default_provider()
            .await?;
        let team = nuka_storage::teams::TeamRepository::new(self.pool.clone())
            .load_team(team_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("unknown team: {team_id}"))?;

        let mut charter = nuka_domain::team::RunCharter::default_for_goal(team.goal.clone());
        charter.success_criteria = team.success_criteria.clone();
        charter.current_phase = "kickoff".to_string();

        let mut run = snapshot_team_into_run(&team, charter);
        execute_round(
            &self.provider_client,
            &provider,
            self.seed_completion.as_deref(),
            &mut run,
            "Kick off the team run",
        )
        .await?;

        let repo = nuka_storage::team_runs::TeamRunRepository::new(self.pool.clone());
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
        nuka_storage::migrations::run(&self.pool).await?;
        self.ensure_seed_provider().await?;

        let provider = crate::providers::ProvidersService::new(self.pool.clone())
            .resolve_default_provider()
            .await?;
        let repo = nuka_storage::team_runs::TeamRunRepository::new(self.pool.clone());
        let mut run = repo
            .load_run(run_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("unknown team run: {run_id}"))?;

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

        execute_round(
            &self.provider_client,
            &provider,
            self.seed_completion.as_deref(),
            &mut run,
            prompt,
        )
        .await?;

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
            .load_run(run_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("unknown team run: {run_id}"))?;

        run.agents.push(nuka_domain::team::TeamRunAgent {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: run.id.clone(),
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

        let provider_repo = nuka_storage::providers::ProviderRepository::new(self.pool.clone());
        if provider_repo.list().await?.is_empty() {
            provider_repo.upsert(provider.clone()).await?;
            let settings_repo = nuka_storage::settings::SettingsRepository::new(self.pool.clone());
            let mut settings = settings_repo.load().await?;
            settings.default_provider_id = Some(provider.id.clone());
            settings_repo.save(&settings).await?;
        }

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
        agents: team
            .agents
            .iter()
            .map(|agent| nuka_domain::team::TeamRunAgent {
                id: uuid::Uuid::new_v4().to_string(),
                run_id: String::new(),
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

fn sample_seed_team() -> nuka_domain::team::Team {
    nuka_domain::team::Team {
        id: "team-release".to_string(),
        name: "Release Team".to_string(),
        goal: "Ship the release cleanly".to_string(),
        summary: "Coordinates release readiness, notes, and final review.".to_string(),
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
    }
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
    }
}
