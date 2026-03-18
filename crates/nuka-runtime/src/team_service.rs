use nuka_integrations::providers::{
    openai::OpenAiCompatibleProvider, types::OpenAiChatMessage, ChatCompletionProvider,
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
    prompt_constraints: serde_json::Value,
    #[serde(default)]
    permission_policy: serde_json::Value,
    #[serde(default)]
    success_criteria: serde_json::Value,
    #[serde(default)]
    coordination_policy: serde_json::Value,
    agents: Vec<GeneratedTeamAgentDraft>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedTeamAgentDraft {
    name: String,
    role: String,
    #[serde(default, alias = "description")]
    responsibility: String,
    #[serde(default)]
    system_prompt: String,
    #[serde(default)]
    tool_bindings: serde_json::Value,
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
                    .complete_chat_stream(
                        &provider,
                        vec![OpenAiChatMessage::user(team_generation_prompt(goal))],
                        |_delta| Ok(()),
                    )
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

        let status = self
            .provider_service
            .test_provider_connection(provider)
            .await?;
        if matches!(
            status,
            nuka_domain::provider::ProviderConnectionStatus::Ready
        ) {
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
    let normalized_payload = normalize_generated_team_payload(payload);
    let draft: GeneratedTeamDraft = serde_json::from_str(&normalized_payload)?;
    let team_id = uuid::Uuid::new_v4().to_string();
    let mut agents = Vec::new();
    let mut agent_assignments = Vec::new();
    let mut generated_agents = Vec::new();

    for (index, agent) in draft.agents.into_iter().enumerate() {
        let agent_id = uuid::Uuid::new_v4().to_string();
        let team_agent_id = uuid::Uuid::new_v4().to_string();
        let assignment_id = uuid::Uuid::new_v4().to_string();
        let order_hint = index as i64;
        let responsibility = normalize_agent_responsibility(&agent);
        let system_prompt = normalize_agent_system_prompt(&agent, &responsibility);
        let tool_bindings = normalize_tool_bindings(&agent.tool_bindings);
        let tool_use_policy = agent.tool_use_policy.unwrap_or_default();

        generated_agents.push(nuka_domain::agent::AgentPreset {
            id: agent_id.clone(),
            name: agent.name.clone(),
            description: format!("{}: {}", agent.role, responsibility),
            system_prompt: system_prompt.clone(),
            provider_id: Some(provider_id.to_string()),
            archetype: nuka_domain::agent::AgentArchetype::inferred_from_text(
                &agent.role,
                &responsibility,
            ),
            knowledge_collection_ids: Vec::new(),
            memory_scope_ids: Vec::new(),
            tool_bindings: tool_bindings.clone(),
        });

        agents.push(nuka_domain::team::TeamAgent {
            id: team_agent_id,
            team_id: team_id.clone(),
            name: agent.name,
            role: agent.role,
            responsibility,
            system_prompt,
            tool_bindings,
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
            prompt_constraints: json_field_to_storage_text(draft.prompt_constraints),
            permission_policy: json_field_to_storage_text(draft.permission_policy),
            success_criteria: json_field_to_storage_text(draft.success_criteria),
            coordination_policy: json_field_to_storage_text(draft.coordination_policy),
            created_at: String::new(),
            updated_at: String::new(),
            status: nuka_domain::team::TeamStatus::Ready,
            agents,
            agent_assignments,
        },
        generated_agents,
    ))
}

fn normalize_generated_team_payload(payload: &str) -> String {
    let trimmed = payload.trim();
    if let Some(stripped) = trimmed.strip_prefix("```") {
        let without_language = stripped
            .split_once('\n')
            .map(|(_, rest)| rest)
            .unwrap_or(stripped);
        if let Some((body, _)) = without_language.rsplit_once("```") {
            return body.trim().to_string();
        }
    }

    if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
        return trimmed[start..=end].trim().to_string();
    }

    trimmed.to_string()
}

fn json_field_to_storage_text(value: serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => String::new(),
        serde_json::Value::String(text) => text,
        other => serde_json::to_string_pretty(&other).unwrap_or_default(),
    }
}

fn normalize_agent_responsibility(agent: &GeneratedTeamAgentDraft) -> String {
    let trimmed = agent.responsibility.trim();
    if trimmed.is_empty() {
        format!("Contribute as {} for the team goal.", agent.role)
    } else {
        trimmed.to_string()
    }
}

fn normalize_agent_system_prompt(agent: &GeneratedTeamAgentDraft, responsibility: &str) -> String {
    let trimmed = agent.system_prompt.trim();
    if trimmed.is_empty() {
        format!(
            "Act as {} in the {} role and focus on {}.",
            agent.name, agent.role, responsibility
        )
    } else {
        trimmed.to_string()
    }
}

fn normalize_tool_bindings(value: &serde_json::Value) -> Vec<nuka_domain::tool::AgentToolBinding> {
    match value {
        serde_json::Value::Array(items) => items.iter().filter_map(parse_tool_binding).collect(),
        _ => Vec::new(),
    }
}

fn parse_tool_binding(value: &serde_json::Value) -> Option<nuka_domain::tool::AgentToolBinding> {
    if let Ok(binding) =
        serde_json::from_value::<nuka_domain::tool::AgentToolBinding>(value.clone())
    {
        return Some(binding);
    }

    let tool = value
        .get("tool")
        .and_then(serde_json::Value::as_str)?
        .trim();
    let purpose = value
        .get("description")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();

    Some(nuka_domain::tool::AgentToolBinding {
        tool_id: format!("generated:{tool}"),
        allowed: true,
        adapter_kind: nuka_domain::tool::ToolAdapterKind::Mcp,
        purpose,
        cost_class: nuka_domain::tool::ToolCostClass::Low,
    })
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
    async fn start_stream_only_team_server() -> (String, tokio::task::JoinHandle<()>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("stream-only team server should bind");
        let address = listener
            .local_addr()
            .expect("stream-only team server should expose local addr");
        let base_url = format!("http://{address}/v1");
        let handle = tokio::spawn(async move {
            let (mut socket, _) = listener
                .accept()
                .await
                .expect("stream-only team server should accept one connection");

            let mut request = Vec::new();
            let mut buffer = [0_u8; 4096];
            let mut header_end = None;

            while header_end.is_none() {
                let read = socket
                    .read(&mut buffer)
                    .await
                    .expect("stream-only team server should read request headers");
                if read == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..read]);
                header_end = request.windows(4).position(|window| window == b"\r\n\r\n");
            }

            let header_end = header_end.expect("request should contain a header boundary");
            let headers = String::from_utf8_lossy(&request[..header_end + 4]).to_string();
            let content_length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    if name.eq_ignore_ascii_case("content-length") {
                        value.trim().parse::<usize>().ok()
                    } else {
                        None
                    }
                })
                .unwrap_or(0);
            while request.len() < header_end + 4 + content_length {
                let read = socket
                    .read(&mut buffer)
                    .await
                    .expect("stream-only team server should read request body");
                if read == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..read]);
            }

            let body = String::from_utf8_lossy(&request[header_end + 4..]).to_string();
            if !body.contains(r#""stream":true"#) {
                socket
                    .write_all(
                        b"HTTP/1.1 504 Gateway Timeout\r\nContent-Type: application/json\r\nContent-Length: 24\r\nConnection: close\r\n\r\n{\"error\":\"stream-only\"}",
                    )
                    .await
                    .expect("stream-only team server should write 504 response");
                return;
            }

            let payload = [
                "data: {\"id\":\"team-stream-1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-test\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\"},\"finish_reason\":null}]}\n\n",
                "data: {\"id\":\"team-stream-1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-test\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"```json\\n{\\n  \\\"name\\\": \\\"Release Stream Team\\\",\\n  \\\"summary\\\": \\\"Coordinates acceptance.\\\",\\n  \\\"successCriteria\\\": \\\"Run completes with evidence.\\\",\\n  \\\"coordinationPolicy\\\": \\\"Coordinator manages bounded review rounds.\\\",\\n  \\\"agents\\\": [\\n    {\\n      \\\"name\\\": \\\"Coordinator\\\",\\n      \\\"role\\\": \\\"Coordinator\\\",\\n      \\\"responsibility\\\": \\\"Guide the team.\\\",\\n      \\\"systemPrompt\\\": \\\"Coordinate the team.\\\",\\n      \\\"toolBindings\\\": [{\\\"tool\\\": \\\"filesystem\\\", \\\"description\\\": \\\"Inspect files\\\"}]\\n    },\\n    {\\n      \\\"name\\\": \\\"Verifier\\\",\\n      \\\"role\\\": \\\"Verifier\\\",\\n      \\\"responsibility\\\": \\\"Check evidence.\\\",\\n      \\\"systemPrompt\\\": \\\"Verify the work.\\\",\\n      \\\"toolBindings\\\": [{\\\"tool\\\": \\\"filesystem\\\", \\\"description\\\": \\\"Read artifacts\\\"}]\\n    }\\n  ]\\n}\\n```\"},\"finish_reason\":null}]}\n\n",
                "data: [DONE]\n\n",
            ]
            .join("");
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                payload.len(),
                payload
            );
            socket
                .write_all(response.as_bytes())
                .await
                .expect("stream-only team server should write streaming response");
        });

        (base_url, handle)
    }

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
        assert!(team
            .agents
            .iter()
            .any(|agent| !agent.tool_bindings.is_empty()));

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
            "https://api.invalid/v1",
            "sk-test",
            "MiniMax-M2.5",
        );
        let provider_id = provider.id.clone();

        service
            .provider_service
            .save_provider(provider)
            .await
            .unwrap();
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
            .contains("provider route resolution failed: unreachable_host"));
    }

    #[tokio::test]
    async fn create_team_from_goal_accepts_streamed_provider_payloads() {
        let (base_url, server) = start_stream_only_team_server().await;
        let service = super::TeamService::new(crate::settings_service::test_pool());
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Stream Provider",
            &base_url,
            "",
            "gpt-stream",
        );
        let provider_id = provider.id.clone();

        service
            .provider_service
            .save_provider(provider)
            .await
            .unwrap();
        service
            .provider_service
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let team = service
            .create_team_from_goal("Ship the release and publish notes")
            .await
            .unwrap();

        server.await.unwrap();

        assert_eq!(team.name, "Release Stream Team");
        assert_eq!(team.agents.len(), 2);
        assert_eq!(team.agent_assignments.len(), 2);
    }

    #[test]
    fn hydrate_generated_team_accepts_code_fenced_json_and_flexible_agent_fields() {
        let payload = r#"```json
{
  "name": "GoalOutlineTeam",
  "summary": "A persistent multi-agent team that creates a clear goal outline.",
  "promptConstraints": [
    "All prompts must be in English.",
    "Keep the outline concise."
  ],
  "permissionPolicy": {
    "allow": ["read:public", "write:team_output"],
    "deny": ["exec:system"]
  },
  "successCriteria": {
    "containsOutline": true,
    "hasObjectives": true
  },
  "coordinationPolicy": {
    "type": "sequential",
    "lead": "PlannerAgent"
  },
  "agents": [
    {
      "name": "PlannerAgent",
      "role": "lead",
      "description": "Generates a high-level goal outline based on the prompt.",
      "toolBindings": [
        {
          "tool": "text_generate",
          "description": "Generates a short outline."
        }
      ]
    },
    {
      "name": "OutlineAgent",
      "role": "member",
      "description": "Expands the outline into milestones and responsibilities.",
      "toolBindings": [
        {
          "tool": "text_expand",
          "description": "Expands outline bullets into detail."
        }
      ]
    }
  ]
}
```"#;

        let (team, generated_agents) =
            super::hydrate_generated_team("Outline the team goal", "provider-live", payload)
                .unwrap();

        assert_eq!(team.name, "GoalOutlineTeam");
        assert_eq!(team.agents.len(), 2);
        assert_eq!(team.agent_assignments.len(), 2);
        assert_eq!(
            team.agents[0].responsibility,
            "Generates a high-level goal outline based on the prompt."
        );
        assert!(team.agents[0].system_prompt.contains("PlannerAgent"));
        assert!(!team.agents[0].tool_bindings.is_empty());
        assert!(team
            .prompt_constraints
            .contains("All prompts must be in English."));
        assert!(team.permission_policy.contains("\"allow\""));
        assert!(team.success_criteria.contains("containsOutline"));
        assert!(team.coordination_policy.contains("PlannerAgent"));
        assert_eq!(generated_agents.len(), 2);
    }
}
