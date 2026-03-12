use nuka_integrations::providers::{
    openai::OpenAiCompatibleProvider, types::OpenAiChatMessage, ChatCompletionProvider,
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
    async fn write_provider_preferences(
        pool: &sqlx::SqlitePool,
        fallback_provider_id: &str,
    ) {
        nuka_storage::runtime_state::RuntimeStateRepository::new(pool.clone())
            .put(
                "settings.providers",
                &format!(
                    r#"{{"fallbackProviderId":"{fallback_provider_id}","connectionChecks":true}}"#
                ),
            )
            .await
            .unwrap();
    }

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
            .send_message("Summarize the release notes", None)
            .await
            .unwrap_err();

        assert!(error
            .to_string()
            .contains("provider connection check failed"));
    }

    #[tokio::test]
    async fn chat_service_compacts_older_messages_before_follow_up_turns() {
        let service = super::ChatService::new_for_test_with_default_provider();
        let first = service
            .send_message("Summarize the release notes", None)
            .await
            .unwrap();
        let session_id = first.session.id.clone();

        service
            .send_message("List the open blockers", Some(&session_id))
            .await
            .unwrap();
        service
            .send_message("Draft the ship-room handoff", Some(&session_id))
            .await
            .unwrap();

        let repo = nuka_storage::chat::ChatRepository::new(service.pool.clone());
        let compactions = repo.list_session_compactions(&session_id).await.unwrap();

        assert_eq!(compactions.len(), 1);
        assert_eq!(compactions[0].message_index, 2);
        assert_eq!(compactions[0].source_message_count, 2);
        assert!(compactions[0]
            .summary
            .contains("Summarize the release notes"));
    }

    #[tokio::test]
    async fn chat_service_falls_back_when_default_provider_cannot_prepare_request() {
        let pool = crate::settings_service::test_pool();
        let provider_service = crate::providers::ProvidersService::new(pool.clone());
        let service = super::ChatService::new_for_test_with_seeded_completion_and_provider_service(
            pool.clone(),
            provider_service.clone(),
        );
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

        provider_service
            .save_provider(broken_provider)
            .await
            .unwrap();
        provider_service
            .save_provider(fallback_provider.clone())
            .await
            .unwrap();
        provider_service
            .set_default_provider("provider-broken")
            .await
            .unwrap();
        write_provider_preferences(&pool, "provider-fallback").await;

        let turn = service
            .send_message("Summarize the release notes", None)
            .await
            .unwrap();

        assert_eq!(turn.provider.id, "provider-fallback");
        assert_eq!(turn.provider.model, "gpt-oss-fallback");
        assert_eq!(turn.session.provider_id.as_deref(), Some("provider-fallback"));
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
        self.send_message_with_route(prompt, session_id, None).await
    }

    pub async fn send_message_with_route(
        &self,
        prompt: &str,
        session_id: Option<&str>,
        route_request: Option<nuka_domain::provider::ProviderRouteRequest>,
    ) -> anyhow::Result<ChatTurnRecord> {
        nuka_storage::migrations::run(&self.pool).await?;
        self.ensure_seed_provider().await?;

        let repo = nuka_storage::chat::ChatRepository::new(self.pool.clone());
        let (mut session, initial_route) = match session_id {
            Some(existing_session_id) => repo
                .load_session_record(existing_session_id)
                .await?
                .map(|record| (record.session, None))
                .ok_or_else(|| anyhow::anyhow!("unknown chat session: {existing_session_id}"))?,
            None => {
                let requested_route = route_request.clone();
                let resolved_route = self
                    .prepare_provider_for_prompt(prompt, requested_route.as_ref())
                    .await?;
                let session = nuka_domain::chat::ChatSessionSummary {
                    id: uuid::Uuid::new_v4().to_string(),
                    title: prompt.chars().take(48).collect(),
                    provider_id: Some(resolved_route.provider.id.clone()),
                    workflow_id: None,
                    message_count: 0,
                    routing: Some(resolved_route.routing.clone()),
                };
                repo.create_session(session.clone()).await?;
                (session, Some(resolved_route))
            }
        };
        let resolved_route = if let Some(resolved_route) = initial_route {
            resolved_route
        } else {
            let requested_route = route_request.or_else(|| {
                session
                    .routing
                    .as_ref()
                    .map(|routing| nuka_domain::provider::ProviderRouteRequest {
                        requested_provider_id: routing.requested_provider_id.clone(),
                        requested_model: routing.requested_model.clone(),
                    })
            });
            self.prepare_provider_for_prompt(prompt, requested_route.as_ref())
                .await?
        };
        let provider = resolved_route.provider.clone();
        session.provider_id = Some(provider.id.clone());
        session.routing = Some(resolved_route.routing.clone());
        if session_id.is_some() {
            repo.create_session(session.clone()).await?;
        }

        let user_message = nuka_domain::chat::ChatMessage {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session.id.clone(),
            role: nuka_domain::chat::ChatMessageRole::User,
            content: prompt.to_string(),
        };
        repo.append_message(user_message.clone()).await?;

        let messages = repo.list_messages(&session.id).await?;
        let compactions = maybe_compact_session_messages(&repo, &session.id, &messages).await?;
        let completion_messages = build_completion_messages(&messages, &compactions);
        let completion = match &self.seed_completion {
            Some(content) => nuka_integrations::providers::types::OpenAiChatCompletionResponse {
                id: uuid::Uuid::new_v4().to_string(),
                choices: vec![
                    nuka_integrations::providers::types::OpenAiChatCompletionChoice {
                        message: OpenAiChatMessage {
                            role: "assistant".to_string(),
                            content: content.clone(),
                        },
                    },
                ],
            },
            None => {
                self.provider_client
                    .complete_chat(&provider, completion_messages)
                    .await?
            }
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
        request: Option<&nuka_domain::provider::ProviderRouteRequest>,
    ) -> anyhow::Result<crate::providers::ResolvedProviderRoute> {
        let route = self.provider_service.resolve_route(request).await?;
        self.provider_client.prepare_chat_request(
            &route.provider,
            vec![OpenAiChatMessage::user(prompt.to_string())],
        )?;
        Ok(route)
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

const CHAT_COMPACTION_RETAIN_MESSAGES: usize = 3;

async fn maybe_compact_session_messages(
    repo: &nuka_storage::chat::ChatRepository,
    session_id: &str,
    messages: &[nuka_domain::chat::ChatMessage],
) -> anyhow::Result<Vec<nuka_storage::chat::ChatSessionCompactionRecord>> {
    let compactions = repo.list_session_compactions(session_id).await?;
    let compacted_count = compactions
        .last()
        .map(|record| record.message_index)
        .unwrap_or(0);
    let live_messages = &messages[compacted_count..];
    let source_message_count = compaction_source_message_count(live_messages.len());
    if source_message_count == 0 {
        return Ok(compactions);
    }

    let record = nuka_storage::chat::ChatSessionCompactionRecord {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: session_id.to_string(),
        message_index: compacted_count + source_message_count,
        source_message_count,
        summary: summarize_messages(&live_messages[..source_message_count]),
        created_at: String::new(),
    };
    repo.create_session_compaction(record).await?;
    repo.list_session_compactions(session_id).await
}

fn build_completion_messages(
    messages: &[nuka_domain::chat::ChatMessage],
    compactions: &[nuka_storage::chat::ChatSessionCompactionRecord],
) -> Vec<OpenAiChatMessage> {
    let compacted_count = compactions
        .last()
        .map(|record| record.message_index)
        .unwrap_or(0);
    let mut provider_messages =
        Vec::with_capacity(messages.len() + usize::from(!compactions.is_empty()));
    if !compactions.is_empty() {
        provider_messages.push(openai_system_message(render_compaction_context(
            compactions,
        )));
    }
    provider_messages.extend(
        messages[compacted_count..]
            .iter()
            .cloned()
            .map(chat_message_to_provider_message),
    );
    provider_messages
}

fn compaction_source_message_count(live_message_count: usize) -> usize {
    let overflow = live_message_count.saturating_sub(CHAT_COMPACTION_RETAIN_MESSAGES);
    if overflow < 2 {
        return 0;
    }

    (overflow / 2) * 2
}

fn summarize_messages(messages: &[nuka_domain::chat::ChatMessage]) -> String {
    messages
        .iter()
        .map(|message| {
            format!(
                "{}: {}",
                provider_role_label(&message.role),
                message
                    .content
                    .replace('\n', " ")
                    .chars()
                    .take(160)
                    .collect::<String>()
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn render_compaction_context(
    compactions: &[nuka_storage::chat::ChatSessionCompactionRecord],
) -> String {
    let mut context = String::from("Compacted earlier conversation:\n");
    context.push_str(
        &compactions
            .iter()
            .map(|record| record.summary.as_str())
            .collect::<Vec<_>>()
            .join("\n\n"),
    );
    context
}

fn provider_role_label(role: &nuka_domain::chat::ChatMessageRole) -> &'static str {
    match role {
        nuka_domain::chat::ChatMessageRole::System => "system",
        nuka_domain::chat::ChatMessageRole::User => "user",
        nuka_domain::chat::ChatMessageRole::Assistant => "assistant",
        nuka_domain::chat::ChatMessageRole::Tool => "tool",
    }
}

fn openai_system_message(content: String) -> OpenAiChatMessage {
    OpenAiChatMessage {
        role: "system".to_string(),
        content,
    }
}
