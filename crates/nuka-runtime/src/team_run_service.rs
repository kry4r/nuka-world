use std::path::{Path, PathBuf};

use nuka_integrations::providers::{openai::OpenAiCompatibleProvider, types::OpenAiChatMessage};

const TEAM_RUN_COMPACTION_EVENT_THRESHOLD: usize = 12;
const TEAM_RUN_COMPACTION_RECENT_WINDOW: usize = 5;
const TEAM_RUN_KICKOFF_PROMPT: &str = "Kick off the team run";

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
    artifact_root: PathBuf,
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
        Self::new_with_provider_service_and_artifact_root(
            pool,
            provider_service,
            default_artifact_root(),
        )
    }

    pub fn new_with_provider_service_and_artifact_root(
        pool: sqlx::SqlitePool,
        provider_service: crate::providers::ProvidersService,
        artifact_root: PathBuf,
    ) -> Self {
        Self {
            pool,
            provider_service,
            provider_client: OpenAiCompatibleProvider::default(),
            artifact_root,
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
        let mut service = Self::new_with_provider_service_and_artifact_root(
            pool,
            provider_service,
            test_artifact_root(),
        );
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

        let team = nuka_storage::teams::TeamRepository::new(self.pool.clone())
            .load_team(team_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("unknown team: {team_id}"))?;

        let mut charter = nuka_domain::team::RunCharter::default_for_goal(team.goal.clone());
        charter.success_criteria = team.success_criteria.clone();
        charter.current_phase = "kickoff".to_string();

        let mut run = snapshot_team_into_run(&team, charter);
        let repo = nuka_storage::team_runs::TeamRunRepository::new(self.pool.clone());
        queue_instruction(
            &mut run,
            TEAM_RUN_KICKOFF_PROMPT,
            "run_queued",
            "Run queued",
        );
        repo.create_run(run.clone()).await?;
        self.drive_team_run(
            &repo,
            &mut run,
            TEAM_RUN_KICKOFF_PROMPT,
            route_request,
            None,
        )
        .await
    }

    pub async fn continue_team_run(
        &self,
        run_id: &str,
        prompt: &str,
    ) -> anyhow::Result<nuka_domain::team::TeamRun> {
        self.continue_team_run_with_route(run_id, prompt, None)
            .await
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
        queue_instruction(&mut run, prompt, "user_instruction", "User follow-up");
        repo.save_run(run.clone()).await?;
        self.drive_team_run(&repo, &mut run, prompt, requested_route, None)
            .await
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

    pub async fn retry_team_run(&self, run_id: &str) -> anyhow::Result<nuka_domain::team::TeamRun> {
        self.recover_team_run(run_id, TeamRunRecoveryMode::Retry)
            .await
    }

    pub async fn resume_team_run(
        &self,
        run_id: &str,
    ) -> anyhow::Result<nuka_domain::team::TeamRun> {
        self.recover_team_run(run_id, TeamRunRecoveryMode::Resume)
            .await
    }

    async fn ensure_seed_provider(&self) -> anyhow::Result<()> {
        let Some(provider) = &self.seed_provider else {
            return Ok(());
        };

        if self.provider_service.list_providers().await?.is_empty() {
            self.provider_service
                .save_provider(provider.clone())
                .await?;
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

    async fn recover_team_run(
        &self,
        run_id: &str,
        mode: TeamRunRecoveryMode,
    ) -> anyhow::Result<nuka_domain::team::TeamRun> {
        nuka_storage::migrations::run(&self.pool).await?;
        self.ensure_seed_provider().await?;

        let repo = nuka_storage::team_runs::TeamRunRepository::new(self.pool.clone());
        let mut run = repo
            .load_run_live(run_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("unknown team run: {run_id}"))?;
        let prompt =
            latest_recovery_prompt(&run).unwrap_or_else(|| TEAM_RUN_KICKOFF_PROMPT.to_string());

        if !update_latest_instruction_status(&mut run, &["blocked", "active", "queued"], "queued") {
            queue_instruction(&mut run, &prompt, "run_queued", "Run queued");
        }

        repo.save_run(run.clone()).await?;
        self.drive_team_run(&repo, &mut run, &prompt, None, Some(mode))
            .await
    }

    async fn drive_team_run(
        &self,
        repo: &nuka_storage::team_runs::TeamRunRepository,
        run: &mut nuka_domain::team::TeamRun,
        prompt: &str,
        route_request: Option<nuka_domain::provider::ProviderRouteRequest>,
        recovery_mode: Option<TeamRunRecoveryMode>,
    ) -> anyhow::Result<nuka_domain::team::TeamRun> {
        let requested_route = route_request.or_else(|| {
            run.routing
                .as_ref()
                .map(|routing| nuka_domain::provider::ProviderRouteRequest {
                    requested_provider_id: routing.requested_provider_id.clone(),
                    requested_model: routing.requested_model.clone(),
                })
        });
        let resolved_route = match self
            .provider_service
            .resolve_route(requested_route.as_ref())
            .await
        {
            Ok(route) => route,
            Err(error) => {
                return self.persist_blocked_run(repo, run, prompt, &error).await;
            }
        };

        run.routing = Some(resolved_route.routing.clone());
        run.status = nuka_domain::team::TeamRunStatus::Active;
        update_latest_instruction_status(run, &["queued", "blocked", "active"], "active");
        push_runtime_progress_event(run, prompt, recovery_mode);
        repo.save_run(run.clone()).await?;

        if let Err(error) = self
            .maybe_run_provider_preflight(&resolved_route.provider, run)
            .await
        {
            return self.persist_blocked_run(repo, run, prompt, &error).await;
        }
        repo.save_run(run.clone()).await?;

        if let Err(error) = execute_round(
            &self.provider_client,
            &resolved_route.provider,
            self.seed_completion.as_deref(),
            &self.artifact_root,
            run,
            prompt,
        )
        .await
        {
            return self.persist_blocked_run(repo, run, prompt, &error).await;
        }

        update_latest_instruction_status(run, &["active", "queued"], "completed");
        self.maybe_compact_run_events(repo, run).await?;
        repo.save_run(run.clone()).await?;
        repo.load_run(&run.id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("persisted run disappeared after save"))
    }

    async fn persist_blocked_run(
        &self,
        repo: &nuka_storage::team_runs::TeamRunRepository,
        run: &mut nuka_domain::team::TeamRun,
        prompt: &str,
        error: &anyhow::Error,
    ) -> anyhow::Result<nuka_domain::team::TeamRun> {
        run.status = nuka_domain::team::TeamRunStatus::Blocked;
        run.current_phase = "blocked".to_string();
        update_latest_instruction_status(run, &["queued", "active"], "blocked");

        for agent in &mut run.agents {
            if matches!(
                agent.status,
                nuka_domain::team::TeamRunAgentStatus::Thinking
                    | nuka_domain::team::TeamRunAgentStatus::Drafting
                    | nuka_domain::team::TeamRunAgentStatus::Reviewing
            ) {
                agent.status = nuka_domain::team::TeamRunAgentStatus::Blocked;
                agent.current_work = "Waiting for run recovery".to_string();
            }
        }

        run.events.push(nuka_domain::team::TeamRunEvent {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: run.id.clone(),
            kind: "run_blocked".to_string(),
            agent_id: None,
            title: "Run blocked".to_string(),
            content: format!("{} ({prompt})", error),
            status: Some("blocked".to_string()),
            tool_name: None,
            tool_call_id: None,
            tool_target: None,
            sequence: next_sequence(&run.events),
            created_at: String::new(),
        });

        repo.save_run(run.clone()).await?;
        repo.load_run(&run.id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("persisted blocked run disappeared after save"))
    }
}

#[derive(Debug, Clone, Copy)]
enum TeamRunRecoveryMode {
    Retry,
    Resume,
}

fn queue_instruction(run: &mut nuka_domain::team::TeamRun, prompt: &str, kind: &str, title: &str) {
    run.status = nuka_domain::team::TeamRunStatus::Queued;
    run.current_phase = "queued".to_string();
    run.events.push(nuka_domain::team::TeamRunEvent {
        id: uuid::Uuid::new_v4().to_string(),
        run_id: run.id.clone(),
        kind: kind.to_string(),
        agent_id: None,
        title: title.to_string(),
        content: prompt.to_string(),
        status: Some("queued".to_string()),
        tool_name: None,
        tool_call_id: None,
        tool_target: None,
        sequence: next_sequence(&run.events),
        created_at: String::new(),
    });
}

fn update_latest_instruction_status(
    run: &mut nuka_domain::team::TeamRun,
    from_statuses: &[&str],
    next_status: &str,
) -> bool {
    for event in run.events.iter_mut().rev() {
        if !matches!(event.kind.as_str(), "run_queued" | "user_instruction") {
            continue;
        }

        let status = event.status.as_deref().unwrap_or_default();
        if !from_statuses.iter().any(|candidate| candidate == &status) {
            continue;
        }

        event.status = Some(next_status.to_string());
        return true;
    }

    false
}

fn latest_recovery_prompt(run: &nuka_domain::team::TeamRun) -> Option<String> {
    run.events
        .iter()
        .rev()
        .find(|event| matches!(event.kind.as_str(), "run_queued" | "user_instruction"))
        .map(|event| event.content.clone())
}

fn latest_checkpoint_excerpt(run: &nuka_domain::team::TeamRun) -> Option<String> {
    run.events
        .iter()
        .rev()
        .find(|event| event.kind == "checkpoint_summary")
        .map(|event| excerpt(&event.content, 96))
}

fn push_runtime_progress_event(
    run: &mut nuka_domain::team::TeamRun,
    prompt: &str,
    recovery_mode: Option<TeamRunRecoveryMode>,
) {
    let (kind, title, content) = match recovery_mode {
        Some(TeamRunRecoveryMode::Retry) => (
            "run_resumed",
            "Run resumed",
            latest_checkpoint_excerpt(run)
                .map(|checkpoint| format!("Retrying from checkpoint: {checkpoint}"))
                .unwrap_or_else(|| format!("Retrying queued prompt: {}", excerpt(prompt, 80))),
        ),
        Some(TeamRunRecoveryMode::Resume) => (
            "run_resumed",
            "Run resumed",
            latest_checkpoint_excerpt(run)
                .map(|checkpoint| format!("Continuing from checkpoint: {checkpoint}"))
                .unwrap_or_else(|| format!("Continuing pending prompt: {}", excerpt(prompt, 80))),
        ),
        None => (
            "run_heartbeat",
            "Run heartbeat",
            format!("Executing prompt: {}", excerpt(prompt, 80)),
        ),
    };

    run.events.push(nuka_domain::team::TeamRunEvent {
        id: uuid::Uuid::new_v4().to_string(),
        run_id: run.id.clone(),
        kind: kind.to_string(),
        agent_id: None,
        title: title.to_string(),
        content,
        status: Some("active".to_string()),
        tool_name: None,
        tool_call_id: None,
        tool_target: None,
        sequence: next_sequence(&run.events),
        created_at: String::new(),
    });
}

async fn execute_round(
    provider_client: &OpenAiCompatibleProvider,
    provider: &nuka_domain::provider::ProviderConfig,
    seed_completion: Option<&str>,
    artifact_root: &Path,
    run: &mut nuka_domain::team::TeamRun,
    prompt: &str,
) -> anyhow::Result<()> {
    let selected_indexes =
        select_active_agent_indexes(&run.agents, run.charter.max_active_agents_per_round);
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
        position_cards.push((agent.name.clone(), content.clone()));
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
            position_cards
                .iter()
                .map(|(name, content)| format!("{name}: {content}"))
                .collect::<Vec<_>>()
                .join("\n")
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
        content: summary.clone(),
        status: Some("completed".to_string()),
        tool_name: None,
        tool_call_id: None,
        tool_target: None,
        sequence: next_sequence(&run.events),
        created_at: String::new(),
    });
    record_round_file_change_events(
        artifact_root,
        run,
        &agenda,
        &position_cards,
        prompt,
        &summary,
    )?;

    for (index, agent) in run.agents.iter_mut().enumerate() {
        if selected_indexes.contains(&index) {
            agent.status = nuka_domain::team::TeamRunAgentStatus::Done;
            agent.current_work = "Completed current round".to_string();
            agent.last_tool_activity = Some("session_artifacts".to_string());
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
        status: nuka_domain::team::TeamRunStatus::Queued,
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
            status: Some("completed".to_string()),
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

fn record_round_file_change_events(
    artifact_root: &Path,
    run: &mut nuka_domain::team::TeamRun,
    agenda: &str,
    position_cards: &[(String, String)],
    prompt: &str,
    checkpoint_summary: &str,
) -> anyhow::Result<()> {
    let round_index = run
        .events
        .iter()
        .filter(|event| event.kind == "checkpoint_summary")
        .count();
    let round_label = format!("Round {round_index}");
    let round_call_id = format!("round-{round_index:02}");
    let round_dir = artifact_root
        .join(&run.id)
        .join(format!("round-{round_index:02}"));

    let mut artifacts = vec![(
        round_dir.join("agenda.md"),
        format!("# {round_label}\n\nPrompt:\n{prompt}\n\nAgenda:\n{agenda}\n"),
    )];

    for (agent_name, content) in position_cards {
        artifacts.push((
            round_dir.join(format!("position-card-{}.md", slug(agent_name))),
            format!("# {agent_name}\n\n{content}\n"),
        ));
    }

    artifacts.push((
        round_dir.join("checkpoint.md"),
        format!("# {round_label} checkpoint\n\n{checkpoint_summary}\n"),
    ));

    for (path, content) in artifacts {
        let change_kind = if path.exists() { "updated" } else { "created" };
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&path, content)?;

        run.events.push(nuka_domain::team::TeamRunEvent {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: run.id.clone(),
            kind: "file_change".to_string(),
            agent_id: run.lead_agent_id.clone(),
            title: round_label.clone(),
            content: path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string(),
            status: Some(change_kind.to_string()),
            tool_name: Some("session_artifacts".to_string()),
            tool_call_id: Some(round_call_id.clone()),
            tool_target: Some(path.to_string_lossy().into_owned()),
            sequence: next_sequence(&run.events),
            created_at: String::new(),
        });
    }

    Ok(())
}

fn slug(value: &str) -> String {
    let mut slug = String::new();
    let mut last_was_dash = false;

    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            last_was_dash = false;
        } else if !last_was_dash {
            slug.push('-');
            last_was_dash = true;
        }
    }

    slug.trim_matches('-').to_string()
}

fn default_artifact_root() -> PathBuf {
    std::env::temp_dir()
        .join("nuka-world")
        .join("team-run-artifacts")
}

fn test_artifact_root() -> PathBuf {
    std::env::temp_dir().join(format!("nuka-world-team-run-test-{}", uuid::Uuid::new_v4()))
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
                system_prompt:
                    "Coordinate the meeting, keep rounds bounded, and summarize checkpoints."
                        .to_string(),
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
                tool_bindings: vec![nuka_domain::tool::AgentToolBinding::allowed(
                    "mcp:filesystem",
                )],
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
            tool_bindings: vec![nuka_domain::tool::AgentToolBinding::allowed(
                "mcp:filesystem",
            )],
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
        assert!(run
            .events
            .iter()
            .any(|event| event.kind == "checkpoint_summary"));
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
        assert_eq!(
            updated.agents[0].responsibility,
            run.agents[0].responsibility
        );
        assert_eq!(
            updated
                .agents
                .last()
                .and_then(|agent| agent.source_agent_id.as_ref()),
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

        runtime
            .provider_service
            .save_provider(provider)
            .await
            .unwrap();
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

    #[tokio::test]
    async fn team_run_returns_blocked_state_when_provider_route_fails() {
        let pool = crate::settings_service::test_pool();
        nuka_storage::migrations::run(&pool).await.unwrap();
        let provider_service = crate::providers::ProvidersService::new(pool.clone());
        let runtime =
            super::TeamRunService::new_for_test_with_seeded_completion_and_provider_service(
                pool.clone(),
                provider_service.clone(),
            );
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Broken",
            "https://api.example.com/v1",
            "",
            "",
        );
        let provider_id = provider.id.clone();

        provider_service.save_provider(provider).await.unwrap();
        provider_service
            .set_default_provider(&provider_id)
            .await
            .unwrap();
        nuka_storage::teams::TeamRepository::new(pool)
            .save_team(super::sample_seed_team())
            .await
            .unwrap();

        let run = runtime.start_team_run("team-release").await.unwrap();

        assert_eq!(run.status, nuka_domain::team::TeamRunStatus::Blocked);
        assert!(run.events.iter().any(|event| event.kind == "run_blocked"));
    }

    #[tokio::test]
    async fn blocked_team_run_can_retry_after_provider_fix() {
        let pool = crate::settings_service::test_pool();
        nuka_storage::migrations::run(&pool).await.unwrap();
        let provider_service = crate::providers::ProvidersService::new(pool.clone());
        let runtime =
            super::TeamRunService::new_for_test_with_seeded_completion_and_provider_service(
                pool.clone(),
                provider_service.clone(),
            );
        let broken_provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Broken",
            "https://api.example.com/v1",
            "",
            "",
        );
        let provider_id = broken_provider.id.clone();

        provider_service
            .save_provider(broken_provider)
            .await
            .unwrap();
        provider_service
            .set_default_provider(&provider_id)
            .await
            .unwrap();
        nuka_storage::teams::TeamRepository::new(pool.clone())
            .save_team(super::sample_seed_team())
            .await
            .unwrap();

        let blocked = runtime.start_team_run("team-release").await.unwrap();
        assert_eq!(blocked.status, nuka_domain::team::TeamRunStatus::Blocked);

        provider_service
            .save_provider(nuka_domain::provider::ProviderConfig {
                id: provider_id,
                name: "Broken".to_string(),
                kind: nuka_domain::provider::ProviderKind::OpenAiCompatible,
                base_url: "http://127.0.0.1:11434/v1".to_string(),
                token: String::new(),
                model: "gpt-oss".to_string(),
                enabled: true,
                secret_ref: None,
                secret_present: false,
                secret_updated_at: None,
            })
            .await
            .unwrap();

        let resumed = runtime.retry_team_run(&blocked.id).await.unwrap();

        assert_eq!(
            resumed.status,
            nuka_domain::team::TeamRunStatus::WaitingForUser
        );
        assert!(resumed.events.iter().any(|event| {
            event.kind == "checkpoint_summary" && event.content.contains("Kick off the team run")
        }));
    }

    #[tokio::test]
    async fn stale_active_team_run_can_resume_from_pending_instruction() {
        let runtime = super::TeamRunService::new_for_test_with_provider();
        let repo = nuka_storage::team_runs::TeamRunRepository::new(runtime.pool.clone());
        let mut run = runtime.start_team_run("team-release").await.unwrap();

        run.status = nuka_domain::team::TeamRunStatus::Active;
        run.updated_at = "2000-01-01 00:00:00".to_string();
        run.events.push(nuka_domain::team::TeamRunEvent {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: run.id.clone(),
            kind: "user_instruction".to_string(),
            agent_id: None,
            title: "User follow-up".to_string(),
            content: "Resume the release validation pass.".to_string(),
            status: Some("active".to_string()),
            tool_name: None,
            tool_call_id: None,
            tool_target: None,
            sequence: super::next_sequence(&run.events),
            created_at: String::new(),
        });
        repo.save_run(run.clone()).await.unwrap();

        let resumed = runtime.resume_team_run(&run.id).await.unwrap();

        assert_eq!(
            resumed.status,
            nuka_domain::team::TeamRunStatus::WaitingForUser
        );
        assert!(resumed.events.iter().any(|event| {
            event.kind == "checkpoint_summary"
                && event
                    .content
                    .contains("Resume the release validation pass.")
        }));
    }

    #[tokio::test]
    async fn team_run_records_real_file_change_events_for_each_round() {
        let runtime = super::TeamRunService::new_for_test_with_provider();
        let run = runtime.start_team_run("team-release").await.unwrap();

        let file_changes = run
            .events
            .iter()
            .filter(|event| event.kind == "file_change")
            .collect::<Vec<_>>();

        assert!(!file_changes.is_empty());
        assert!(file_changes.iter().all(|event| event.title == "Round 1"));
        assert!(file_changes
            .iter()
            .all(|event| event.status.as_deref() == Some("created")));
        assert!(file_changes.iter().all(|event| {
            event
                .tool_target
                .as_ref()
                .is_some_and(|path| std::path::Path::new(path).exists())
        }));
    }
}
