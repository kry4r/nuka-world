use nuka_integrations::providers::{
    openai::OpenAiCompatibleProvider,
    types::OpenAiChatMessage,
    ChatCompletionProvider,
};

const CHAT_COMPACTION_MESSAGE_THRESHOLD: usize = 4;
const CHAT_COMPACTION_RECENT_WINDOW: usize = 4;

#[derive(Debug, Clone)]
pub struct ChatTurnRecord {
    pub session: nuka_domain::chat::ChatSessionSummary,
    pub messages: Vec<nuka_domain::chat::ChatMessage>,
    pub provider: nuka_domain::provider::ProviderConfig,
}

#[derive(Debug, Clone)]
pub struct ChatService {
    pool: sqlx::SqlitePool,
    provider_service: crate::providers::ProvidersService,
    provider_client: OpenAiCompatibleProvider,
    seed_provider: Option<nuka_domain::provider::ProviderConfig>,
    seed_completion: Option<String>,
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn chat_service_persists_assistant_completion() {
        let service = super::ChatService::new_for_test_with_default_provider();
        let turn = service
            .send_message("Summarize the release notes", None)
            .await
            .unwrap();

        assert_eq!(turn.messages.len(), 2);
        assert!(matches!(
            turn.messages[1].role,
            nuka_domain::chat::ChatMessageRole::Assistant
        ));
    }

    #[tokio::test]
    async fn chat_service_requires_provider_preflight_when_connection_checks_are_enabled() {
        let pool = crate::settings_service::test_pool();
        let service = super::ChatService::new_for_test_with_seeded_completion(pool.clone());
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
            .send_message("Summarize the release notes", None)
            .await
            .unwrap_err();

        assert!(error
            .to_string()
            .contains("provider connection check failed"));
    }
}

impl ChatService {
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

    pub fn new_for_test_without_provider() -> Self {
        Self::new(crate::settings_service::test_pool())
    }

    pub fn new_for_test_with_default_provider() -> Self {
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
        let mut service = Self::new(pool);
        service.provider_service = provider_service;
        service.seed_completion = Some("Seeded assistant response".to_string());
        service
    }

    pub async fn send_message(
        &self,
        prompt: &str,
        session_id: Option<&str>,
    ) -> anyhow::Result<ChatTurnRecord> {
        let provider = self.prepare_provider_for_prompt(prompt).await?;

        let repo = nuka_storage::chat::ChatRepository::new(self.pool.clone());
        let mut session = match session_id {
            Some(existing_session_id) => repo
                .list_sessions()
                .await?
                .into_iter()
                .find(|session| session.id == existing_session_id)
                .ok_or_else(|| anyhow::anyhow!("unknown chat session: {existing_session_id}"))?,
            None => {
                let session = nuka_domain::chat::ChatSessionSummary {
                    id: uuid::Uuid::new_v4().to_string(),
                    title: prompt.chars().take(48).collect(),
                    provider_id: Some(provider.id.clone()),
                    workflow_id: None,
                    message_count: 0,
                };
                repo.create_session(session.clone()).await?;
                session
            }
        };

        let user_message = nuka_domain::chat::ChatMessage {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session.id.clone(),
            role: nuka_domain::chat::ChatMessageRole::User,
            content: prompt.to_string(),
        };
        repo.append_message(user_message.clone()).await?;
        self.maybe_compact_session(&repo, &session.id).await?;

        let completion_messages = repo
            .list_messages(&session.id)
            .await?
            .into_iter()
            .map(chat_message_to_provider_message)
            .collect::<Vec<_>>();
        let completion = match &self.seed_completion {
            Some(content) => nuka_integrations::providers::types::OpenAiChatCompletionResponse {
                id: uuid::Uuid::new_v4().to_string(),
                choices: vec![nuka_integrations::providers::types::OpenAiChatCompletionChoice {
                    message: OpenAiChatMessage {
                        role: "assistant".to_string(),
                        content: content.clone(),
                    },
                }],
            },
            None => self
                .provider_client
                .complete_chat(&provider, completion_messages)
                .await?,
        };

        let assistant_message = nuka_domain::chat::ChatMessage {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session.id.clone(),
            role: nuka_domain::chat::ChatMessageRole::Assistant,
            content: completion
                .choices
                .first()
                .map(|choice| choice.message.content.clone())
                .unwrap_or_default(),
        };
        repo.append_message(assistant_message.clone()).await?;
        self.maybe_compact_session(&repo, &session.id).await?;

        session.message_count = repo.list_messages(&session.id).await?.len();

        Ok(ChatTurnRecord {
            session,
            messages: vec![user_message, assistant_message],
            provider,
        })
    }

    pub async fn prepare_provider_for_prompt(
        &self,
        prompt: &str,
    ) -> anyhow::Result<nuka_domain::provider::ProviderConfig> {
        nuka_storage::migrations::run(&self.pool).await?;
        self.ensure_seed_provider().await?;

        let provider = self.provider_service.resolve_default_provider().await?;

        self.provider_client.prepare_chat_request(
            &provider,
            vec![OpenAiChatMessage::user(prompt.to_string())],
        )?;
        if self.connection_checks_enabled().await? {
            self.run_provider_preflight(&provider).await?;
        }

        Ok(provider)
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

    async fn maybe_compact_session(
        &self,
        repo: &nuka_storage::chat::ChatRepository,
        session_id: &str,
    ) -> anyhow::Result<()> {
        let live_messages = repo.list_live_messages(session_id).await?;
        if live_messages.len() <= CHAT_COMPACTION_MESSAGE_THRESHOLD {
            return Ok(());
        }

        let compact_count = live_messages
            .len()
            .saturating_sub(CHAT_COMPACTION_RECENT_WINDOW);
        if compact_count == 0 {
            return Ok(());
        }

        let compacted_messages = &live_messages[..compact_count];
        let compacted_ids = compacted_messages
            .iter()
            .map(|message| message.id.clone())
            .collect::<Vec<_>>();
        repo.compact_messages(
            session_id,
            &compacted_ids,
            &summarize_chat_messages(compacted_messages),
        )
        .await
    }

    async fn run_provider_preflight(
        &self,
        provider: &nuka_domain::provider::ProviderConfig,
    ) -> anyhow::Result<()> {
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

fn chat_message_to_provider_message(message: nuka_domain::chat::ChatMessage) -> OpenAiChatMessage {
    OpenAiChatMessage {
        role: match message.role {
            nuka_domain::chat::ChatMessageRole::System => "system",
            nuka_domain::chat::ChatMessageRole::User => "user",
            nuka_domain::chat::ChatMessageRole::Assistant => "assistant",
            nuka_domain::chat::ChatMessageRole::Tool => "tool",
        }
        .to_string(),
        content: message.content,
    }
}

fn summarize_chat_messages(messages: &[nuka_domain::chat::ChatMessage]) -> String {
    let lines = messages
        .iter()
        .map(|message| {
            format!(
                "- {}: {}",
                chat_role_label(&message.role),
                excerpt(&message.content, 96)
            )
        })
        .collect::<Vec<_>>();
    format!(
        "Compacted earlier chat context ({} messages):\n{}",
        messages.len(),
        lines.join("\n")
    )
}

fn chat_role_label(role: &nuka_domain::chat::ChatMessageRole) -> &'static str {
    match role {
        nuka_domain::chat::ChatMessageRole::System => "system",
        nuka_domain::chat::ChatMessageRole::User => "user",
        nuka_domain::chat::ChatMessageRole::Assistant => "assistant",
        nuka_domain::chat::ChatMessageRole::Tool => "tool",
    }
}

fn excerpt(content: &str, limit: usize) -> String {
    let mut excerpt = content.trim().replace('\n', " ");
    if excerpt.chars().count() > limit {
        excerpt = excerpt.chars().take(limit).collect::<String>();
        excerpt.push_str("...");
    }
    excerpt
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
