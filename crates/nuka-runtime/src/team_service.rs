use nuka_integrations::providers::{
    openai::OpenAiCompatibleProvider,
    types::OpenAiChatMessage,
};

#[derive(Debug, Clone)]
pub struct TeamService {
    pool: sqlx::SqlitePool,
    provider_client: OpenAiCompatibleProvider,
    seed_provider: Option<nuka_domain::provider::ProviderConfig>,
    seed_completion: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedTeamDraft {
    name: String,
    summary: String,
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
        Self {
            pool,
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
        Self {
            pool,
            provider_client: OpenAiCompatibleProvider::default(),
            seed_provider: None,
            seed_completion: Some(
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
            ),
        }
    }

    pub async fn create_team_from_goal(
        &self,
        goal: &str,
    ) -> anyhow::Result<nuka_domain::team::Team> {
        nuka_storage::migrations::run(&self.pool).await?;
        self.ensure_seed_provider().await?;

        let provider = crate::providers::ProvidersService::new(self.pool.clone())
            .resolve_default_provider()
            .await?;
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

        let team = hydrate_generated_team(goal, &completion)?;
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
}

fn team_generation_prompt(goal: &str) -> String {
    format!(
        "Generate JSON for a persistent Team that can execute this goal: {goal}. Include name, summary, successCriteria, coordinationPolicy, and at least two agents with explicit toolBindings."
    )
}

fn hydrate_generated_team(
    goal: &str,
    payload: &str,
) -> anyhow::Result<nuka_domain::team::Team> {
    let draft: GeneratedTeamDraft = serde_json::from_str(payload)?;
    let team_id = uuid::Uuid::new_v4().to_string();

    Ok(nuka_domain::team::Team {
        id: team_id.clone(),
        name: draft.name,
        goal: goal.to_string(),
        summary: draft.summary,
        success_criteria: draft.success_criteria,
        coordination_policy: draft.coordination_policy,
        created_at: String::new(),
        updated_at: String::new(),
        status: nuka_domain::team::TeamStatus::Ready,
        agents: draft
            .agents
            .into_iter()
            .enumerate()
            .map(|(index, agent)| nuka_domain::team::TeamAgent {
                id: uuid::Uuid::new_v4().to_string(),
                team_id: team_id.clone(),
                name: agent.name,
                role: agent.role,
                responsibility: agent.responsibility,
                system_prompt: agent.system_prompt,
                tool_bindings: agent.tool_bindings,
                tool_use_policy: agent.tool_use_policy.unwrap_or_default(),
                order_hint: index as i64,
                created_at: String::new(),
                updated_at: String::new(),
            })
            .collect(),
    })
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
        assert!(team.agents.iter().any(|agent| !agent.tool_bindings.is_empty()));
    }
}
