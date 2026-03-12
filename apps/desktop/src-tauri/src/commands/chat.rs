use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRouteResponse {
    pub session_id: String,
    pub run_id: Option<String>,
    pub session: ChatSessionResponse,
    pub route: ChatRoute,
    pub messages: Vec<ChatMessageResponse>,
    pub output: String,
    pub exit_status: String,
    pub provider: Option<ChatProviderResponse>,
    pub context: ChatContextResponse,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSessionResponse {
    pub id: String,
    pub title: String,
    pub provider_id: Option<String>,
    pub message_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageResponse {
    pub id: String,
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatProviderResponse {
    pub id: String,
    pub name: String,
    pub model: String,
    pub base_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatContextResponse {
    pub attached_agents: Vec<String>,
    pub attached_knowledge_libraries: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ChatRoute {
    DirectReply,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ChatModeInput {
    DirectChat,
}

#[tauri::command]
pub async fn route_world_prompt(
    prompt: String,
    session_id: Option<String>,
    mode: ChatModeInput,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<ChatRouteResponse, String> {
    route_world_prompt_inner(prompt, session_id, mode, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn execute_prompt_json(
    prompt: String,
    session_id: Option<String>,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<ChatRouteResponse, String> {
    execute_prompt_json_inner(prompt, session_id, &state)
        .await
        .map_err(|error| error.to_string())
}

async fn execute_prompt_json_inner(
    prompt: String,
    session_id: Option<String>,
    state: &crate::app_state::AppState,
) -> anyhow::Result<ChatRouteResponse> {
    route_world_prompt_inner(prompt, session_id, ChatModeInput::DirectChat, state).await
}

async fn route_world_prompt_inner(
    prompt: String,
    session_id: Option<String>,
    mode: ChatModeInput,
    state: &crate::app_state::AppState,
) -> anyhow::Result<ChatRouteResponse> {
    let prompt_for_memory = prompt.clone();
    let world_mode: nuka_runtime::world::WorldChatMode = mode.into();
    let turn = match session_id.as_deref() {
        Some(session_id) => {
            state
                .world_runtime()
                .continue_session(session_id, &prompt, Some(world_mode))
                .await
        }
        None => state.world_runtime().start_session(&prompt, world_mode).await,
    }?;

    let route = match turn.route {
        nuka_runtime::world::WorldRoute::DirectReply => ChatRoute::DirectReply,
    };

    let (session, messages, provider) = match turn.chat_turn {
        Some(chat_turn) => (
            ChatSessionResponse::from(chat_turn.session.clone()),
            chat_turn
                .messages
                .into_iter()
                .map(ChatMessageResponse::from)
                .collect(),
            Some(ChatProviderResponse::from(chat_turn.provider)),
        ),
        None => (
            ChatSessionResponse {
                id: turn.session.id.clone(),
                title: prompt.chars().take(48).collect(),
                provider_id: None,
                message_count: 1,
            },
            vec![ChatMessageResponse {
                id: format!("{}-user", turn.session.id),
                role: "user".to_string(),
                content: prompt,
            }],
            None,
        ),
    };
    let output = messages
        .iter()
        .rev()
        .find(|message| message.role == "assistant")
        .map(|message| message.content.clone())
        .or_else(|| messages.last().map(|message| message.content.clone()))
        .unwrap_or_default();

    state
        .memory_service()
        .handle_runtime_event(nuka_runtime::runtime_events::RuntimeEvent::ChatTurnCompleted {
            session_id: session.id.clone(),
            prompt: prompt_for_memory,
        })
        .await?;

    Ok(ChatRouteResponse {
        session_id: session.id.clone(),
        run_id: None,
        session,
        route,
        messages,
        output,
        exit_status: "completed".to_string(),
        provider,
        context: ChatContextResponse {
            attached_agents: Vec::new(),
            attached_knowledge_libraries: Vec::new(),
        },
    })
}

impl From<ChatModeInput> for nuka_runtime::world::WorldChatMode {
    fn from(value: ChatModeInput) -> Self {
        match value {
            ChatModeInput::DirectChat => Self::DirectChat,
        }
    }
}

impl From<nuka_domain::chat::ChatSessionSummary> for ChatSessionResponse {
    fn from(value: nuka_domain::chat::ChatSessionSummary) -> Self {
        Self {
            id: value.id,
            title: value.title,
            provider_id: value.provider_id,
            message_count: value.message_count,
        }
    }
}

impl From<nuka_domain::chat::ChatMessage> for ChatMessageResponse {
    fn from(value: nuka_domain::chat::ChatMessage) -> Self {
        Self {
            id: value.id,
            role: match value.role {
                nuka_domain::chat::ChatMessageRole::System => "system",
                nuka_domain::chat::ChatMessageRole::User => "user",
                nuka_domain::chat::ChatMessageRole::Assistant => "assistant",
                nuka_domain::chat::ChatMessageRole::Tool => "tool",
            }
            .to_string(),
            content: value.content,
        }
    }
}

impl From<nuka_domain::provider::ProviderConfig> for ChatProviderResponse {
    fn from(value: nuka_domain::provider::ProviderConfig) -> Self {
        Self {
            id: value.id,
            name: value.name,
            model: value.model,
            base_url: value.base_url,
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn chat_mode_input_deserializes_direct_chat_from_payload() {
        let mode: super::ChatModeInput = serde_json::from_str(r#"{"kind":"direct_chat"}"#)
            .unwrap();

        assert!(matches!(mode, super::ChatModeInput::DirectChat));
    }

    #[tokio::test]
    async fn route_world_prompt_requires_default_provider() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();

        let error = super::route_world_prompt_inner(
            "summarize today's notes".to_string(),
            None,
            super::ChatModeInput::DirectChat,
            &state,
        )
        .await
        .unwrap_err();

        assert!(error.to_string().contains("default provider is not configured"));
    }

    #[tokio::test]
    async fn route_world_prompt_returns_backend_session_messages_and_provider() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Local",
            "http://localhost:11434/v1",
            "",
            "gpt-oss",
        );
        let provider_id = provider.id.clone();

        state.provider_service().save_provider(provider).await.unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let response = super::route_world_prompt_inner(
            "summarize today's notes".to_string(),
            None,
            super::ChatModeInput::DirectChat,
            &state,
        )
        .await
        .unwrap();

        assert!(!response.session.id.is_empty());
        assert_eq!(response.messages.len(), 2);
        assert_eq!(response.messages[0].content, "summarize today's notes");
        assert_eq!(response.messages[1].role, "assistant");
        assert_eq!(response.provider.as_ref().map(|provider| provider.name.as_str()), Some("Local"));
    }

    #[tokio::test]
    async fn route_world_prompt_creates_chat_memory_candidate_for_the_session() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Local",
            "http://localhost:11434/v1",
            "",
            "gpt-oss",
        );
        let provider_id = provider.id.clone();

        state.provider_service().save_provider(provider).await.unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let response = super::route_world_prompt_inner(
            "capture the release checklist".to_string(),
            None,
            super::ChatModeInput::DirectChat,
            &state,
        )
        .await
        .unwrap();
        let pending = state.memory_service().list_pending_candidates().await.unwrap();

        assert!(pending.iter().any(|candidate| {
            candidate.surface == nuka_domain::memory::MemorySurface::Chat
                && candidate.owner_id == response.session.id
        }));
    }

    #[tokio::test]
    async fn route_world_prompt_accepts_direct_chat_mode_value() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Local",
            "http://localhost:11434/v1",
            "",
            "gpt-oss",
        );
        let provider_id = provider.id.clone();

        state.provider_service().save_provider(provider).await.unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let response = super::route_world_prompt_inner(
            "draft a release flow".to_string(),
            None,
            super::ChatModeInput::DirectChat,
            &state,
        )
        .await
        .unwrap();

        assert!(matches!(response.route, super::ChatRoute::DirectReply));
    }

    #[tokio::test]
    async fn route_world_prompt_exposes_structured_execution_result_metadata() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Local",
            "http://localhost:11434/v1",
            "",
            "gpt-oss",
        );
        let provider_id = provider.id.clone();

        state.provider_service().save_provider(provider).await.unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let response = super::route_world_prompt_inner(
            "summarize today's notes".to_string(),
            None,
            super::ChatModeInput::DirectChat,
            &state,
        )
        .await
        .unwrap();
        let response_json = serde_json::to_value(&response).unwrap();

        assert_eq!(response_json["sessionId"], response.session.id);
        assert!(response_json["runId"].is_null());
        assert_eq!(response_json["output"], response.messages[1].content);
        assert_eq!(response_json["exitStatus"], "completed");
        assert_eq!(response_json["provider"]["id"], provider_id);
        assert_eq!(response_json["provider"]["model"], "gpt-oss");
    }

    #[tokio::test]
    async fn route_world_prompt_does_not_expose_workflow_ids_in_chat_session_payload() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Local",
            "http://localhost:11434/v1",
            "",
            "gpt-oss",
        );
        let provider_id = provider.id.clone();

        state.provider_service().save_provider(provider).await.unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let response = super::route_world_prompt_inner(
            "summarize today's notes".to_string(),
            None,
            super::ChatModeInput::DirectChat,
            &state,
        )
        .await
        .unwrap();
        let response_json = serde_json::to_value(&response).unwrap();

        assert!(
            response_json["session"].get("workflowId").is_none(),
            "workflowId should not leak through the direct chat payload"
        );
    }

    #[tokio::test]
    async fn execute_prompt_json_uses_direct_chat_runtime_and_returns_structured_payload() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Local",
            "http://localhost:11434/v1",
            "",
            "gpt-oss",
        );
        let provider_id = provider.id.clone();

        state.provider_service().save_provider(provider).await.unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let response = super::execute_prompt_json_inner(
            "summarize today's notes".to_string(),
            None,
            &state,
        )
        .await
        .unwrap();
        let response_json = serde_json::to_value(&response).unwrap();

        assert_eq!(response_json["sessionId"], response.session.id);
        assert!(response_json["runId"].is_null());
        assert_eq!(response_json["output"], "Seeded assistant response");
        assert_eq!(response_json["exitStatus"], "completed");
        assert_eq!(response_json["provider"]["id"], provider_id);
        assert_eq!(response_json["provider"]["model"], "gpt-oss");
    }
}
