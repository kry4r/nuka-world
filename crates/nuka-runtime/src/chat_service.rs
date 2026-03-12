use nuka_integrations::providers::{
    openai::OpenAiCompatibleProvider,
    types::OpenAiChatMessage,
    ChatCompletionProvider,
};

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

        session.message_count += 2;

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
