use nuka_integrations::providers::{
    openai::OpenAiCompatibleProvider,
    types::OpenAiChatMessage,
    ChatCompletionProvider,
};

#[derive(Debug, Clone)]
pub struct TeamService {
    pool: sqlx::SqlitePool,
    provider_service: crate::providers::ProvidersService,
    provider_client: OpenAiCompatibleProvider,
    seed_provider: Option<nuka_domain::provider::ProviderConfig>,
    seed_completion: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedTeamDraft {
    name: String,
    summary: String,
    #[serde(default)]
    prompt_constraints: String,
    #[serde(default)]
    permission_policy: String,
    success_criteria: String,
    coordination_policy: String,
    agents: Vec<GeneratedTeamAgentDraft>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedTeamAgentDraft {
    name: String,
    role: String,
    responsibility: String,
    system_prompt: String,
    tool_bindings: Vec<nuka_domain::tool::AgentToolBinding>,
    #[serde(default)]
    tool_use_policy: Option<nuka_domain::tool::ToolUsePolicy>,
}

impl TeamService {
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
        service.seed_completion = Some(
            r#"{
                  "name": "Release Team",
                  "summary": "Coordinates release readiness, notes, and final sign-off.",
                  "successCriteria": "Release ships with clear notes and no unresolved blockers.",
                  "coordinationPolicy": "A coordinator runs bounded planning and review rounds.",
                  "agents": [
                    {
                      "name": "Coordinator",
                      "role": "Coordinator",
                      "responsibility": "Run the agenda and reconcile disagreements.",
                      "systemPrompt": "Coordinate the team and keep rounds bounded.",
                      "toolBindings": [
                        {
                          "tool_id": "cli:git-read",
                          "allowed": true,
                          "adapter_kind": "Cli",
                          "purpose": "Inspect repository status and release artifacts",
                          "cost_class": "Medium"
                        }
                      ]
                    },
                    {
                      "name": "Release Writer",
                      "role": "Writer",
                      "responsibility": "Draft the release notes and final summary.",
                      "systemPrompt": "Write concise, user-facing release notes.",
                      "toolBindings": [
                        {
                          "tool_id": "mcp:filesystem",
                          "allowed": true,
                          "adapter_kind": "Mcp",
                          "purpose": "Read release notes sources from the workspace",
                          "cost_class": "Low"
                        }
                      ]
                    }
                  ]
                }"#
                .to_string(),
        );
        service
    }

    pub async fn create_team_from_goal(
        &self,
        goal: &str,
    ) -> anyhow::Result<nuka_domain::team::Team> {
        nuka_storage::migrations::run(&self.pool).await?;
        self.ensure_seed_provider().await?;

        let provider = self.provider_service.resolve_default_provider().await?;
        if self.connection_checks_enabled().await? {
            self.run_provider_preflight(&provider).await?;
        }
        let completion = match &self.seed_completion {
            Some(payload) => payload.clone(),
            None => {
                let response = self
                    .provider_client
                    .complete_chat(&provider, vec![OpenAiChatMessage::user(team_generation_prompt(goal))])
                    .await?;
                response
                    .choices
                    .first()
                    .map(|choice| choice.message.content.clone())
                    .unwrap_or_default()
            }
        };

        let (team, generated_agents) = hydrate_generated_team(goal, &provider.id, &completion)?;
        let agents_repo = nuka_storage::agents::AgentRepository::new(self.pool.clone());
        for agent in generated_agents {
            agents_repo.upsert(agent).await?;
        }
        let repo = nuka_storage::teams::TeamRepository::new(self.pool.clone());
        repo.save_team(team.clone()).await?;
        repo.load_team(&team.id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("persisted team disappeared after save"))
    }

    pub async fn list_teams(&self) -> anyhow::Result<Vec<nuka_domain::team::Team>> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::teams::TeamRepository::new(self.pool.clone())
            .list_teams()
            .await
    }

    pub async fn load_team(
        &self,
        team_id: &str,
    ) -> anyhow::Result<Option<nuka_domain::team::Team>> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::teams::TeamRepository::new(self.pool.clone())
            .load_team(team_id)
            .await
    }

    pub async fn update_team(&self, team: nuka_domain::team::Team) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::teams::TeamRepository::new(self.pool.clone())
            .save_team(team)
            .await
    }

    pub async fn delete_team(&self, team_id: &str) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::teams::TeamRepository::new(self.pool.clone())
            .delete_team(team_id)
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

    async fn run_provider_preflight(
        &self,
        provider: &nuka_domain::provider::ProviderConfig,
    ) -> anyhow::Result<()> {
        self.provider_client.prepare_chat_request(
            provider,
            vec![OpenAiChatMessage::user("Provider preflight".to_string())],
        )?;

        if is_local_provider(&provider.base_url) {
            return Ok(());
        }

        let status = self.provider_service.test_provider_connection(provider).await?;
        if matches!(status, nuka_domain::provider::ProviderConnectionStatus::Ready) {
            Ok(())
        } else {
            anyhow::bail!(
                "provider connection check failed: {}",
                provider_connection_status_label(&status)
            );
        }
    }
}

fn team_generation_prompt(goal: &str) -> String {
    format!(
        "Generate JSON for a persistent Team that can execute this goal: {goal}. Include name, summary, promptConstraints, permissionPolicy, successCriteria, coordinationPolicy, and at least two agents with explicit toolBindings."
    )
}

fn hydrate_generated_team(
    goal: &str,
    provider_id: &str,
    payload: &str,
) -> anyhow::Result<(
    nuka_domain::team::Team,
    Vec<nuka_domain::agent::AgentPreset>,
)> {
    let draft: GeneratedTeamDraft = serde_json::from_str(payload)?;
    let team_id = uuid::Uuid::new_v4().to_string();
    let mut agents = Vec::new();
    let mut agent_assignments = Vec::new();
    let mut generated_agents = Vec::new();

    for (index, agent) in draft.agents.into_iter().enumerate() {
        let agent_id = uuid::Uuid::new_v4().to_string();
        let team_agent_id = uuid::Uuid::new_v4().to_string();
        let assignment_id = uuid::Uuid::new_v4().to_string();
        let order_hint = index as i64;
        let tool_use_policy = agent.tool_use_policy.unwrap_or_default();

        generated_agents.push(nuka_domain::agent::AgentPreset {
            id: agent_id.clone(),
            name: agent.name.clone(),
            description: format!("{}: {}", agent.role, agent.responsibility),
            system_prompt: agent.system_prompt.clone(),
            provider_id: Some(provider_id.to_string()),
            knowledge_collection_ids: Vec::new(),
            memory_scope_ids: Vec::new(),
            tool_bindings: agent.tool_bindings.clone(),
        });

        agents.push(nuka_domain::team::TeamAgent {
            id: team_agent_id,
            team_id: team_id.clone(),
            name: agent.name,
            role: agent.role,
            responsibility: agent.responsibility,
            system_prompt: agent.system_prompt,
            tool_bindings: agent.tool_bindings,
            tool_use_policy: tool_use_policy.clone(),
            order_hint,
            created_at: String::new(),
            updated_at: String::new(),
        });

        agent_assignments.push(nuka_domain::team::TeamAgentAssignment {
            id: assignment_id,
            team_id: team_id.clone(),
            agent_id,
            enabled: true,
            order_hint,
            prompt_override: None,
            permission_override_json: "{}".to_string(),
            created_at: String::new(),
            updated_at: String::new(),
        });
    }

    Ok((
        nuka_domain::team::Team {
        id: team_id.clone(),
        name: draft.name,
        goal: goal.to_string(),
        summary: draft.summary,
        prompt_constraints: draft.prompt_constraints,
        permission_policy: draft.permission_policy,
        success_criteria: draft.success_criteria,
        coordination_policy: draft.coordination_policy,
        created_at: String::new(),
        updated_at: String::new(),
        status: nuka_domain::team::TeamStatus::Ready,
        agents,
        agent_assignments,
    },
        generated_agents,
    ))
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

fn is_local_provider(base_url: &str) -> bool {
    let normalized = base_url.to_ascii_lowercase();
    normalized.contains("localhost") || normalized.contains("127.0.0.1")
}

fn provider_connection_status_label(
    status: &nuka_domain::provider::ProviderConnectionStatus,
) -> &'static str {
    match status {
        nuka_domain::provider::ProviderConnectionStatus::Unknown => "unknown",
        nuka_domain::provider::ProviderConnectionStatus::Ready => "ready",
        nuka_domain::provider::ProviderConnectionStatus::InvalidUrl => "invalid_url",
        nuka_domain::provider::ProviderConnectionStatus::InvalidToken => "invalid_token",
        nuka_domain::provider::ProviderConnectionStatus::MissingModel => "missing_model",
        nuka_domain::provider::ProviderConnectionStatus::UnreachableHost => "unreachable_host",
        nuka_domain::provider::ProviderConnectionStatus::Timeout => "timeout",
        nuka_domain::provider::ProviderConnectionStatus::UpstreamFailure => "upstream_failure",
    }
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn create_team_from_goal_persists_generated_agents() {
        let service = super::TeamService::new_for_test_with_provider();
        let team = service
            .create_team_from_goal("Ship the release and publish notes")
            .await
            .unwrap();

        assert!(!team.id.is_empty());
        assert!(team.agents.len() >= 2);
        assert_eq!(team.agent_assignments.len(), team.agents.len());
        assert!(team.agents.iter().any(|agent| !agent.tool_bindings.is_empty()));

        let saved_agents = nuka_storage::agents::AgentRepository::new(service.pool.clone())
            .list()
            .await
            .unwrap();

        assert!(team.agent_assignments.iter().all(|assignment| saved_agents
            .iter()
            .any(|agent| agent.id == assignment.agent_id)));
    }

    #[tokio::test]
    async fn create_team_from_goal_requires_provider_preflight_when_connection_checks_are_enabled()
    {
        let pool = crate::settings_service::test_pool();
        let service = super::TeamService::new_for_test_with_seeded_completion(pool.clone());
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Remote",
            "https://api.example.com/v1",
            "",
            "MiniMax-M2.5",
        );
        let provider_id = provider.id.clone();

        service.provider_service.save_provider(provider).await.unwrap();
        service
            .provider_service
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let error = service
            .create_team_from_goal("Ship the release and publish notes")
            .await
            .unwrap_err();

        assert!(error
            .to_string()
            .contains("provider connection check failed"));
    }
}
