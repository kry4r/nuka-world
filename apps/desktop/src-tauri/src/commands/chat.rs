use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendChatPromptResponse {
    pub session_id: String,
    pub run_id: Option<String>,
    pub session: ChatSessionResponse,
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

#[tauri::command]
pub async fn send_chat_prompt(
    prompt: String,
    session_id: Option<String>,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<SendChatPromptResponse, String> {
    send_chat_prompt_inner(prompt, session_id, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn execute_prompt_json(
    prompt: String,
    session_id: Option<String>,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<SendChatPromptResponse, String> {
    execute_prompt_json_inner(prompt, session_id, &state)
        .await
        .map_err(|error| error.to_string())
}

async fn execute_prompt_json_inner(
    prompt: String,
    session_id: Option<String>,
    state: &crate::app_state::AppState,
) -> anyhow::Result<SendChatPromptResponse> {
    send_chat_prompt_inner(prompt, session_id, state).await
}

async fn send_chat_prompt_inner(
    prompt: String,
    session_id: Option<String>,
    state: &crate::app_state::AppState,
) -> anyhow::Result<SendChatPromptResponse> {
    let prompt_for_memory = prompt.clone();
    let turn = state
        .chat_service()
        .send_message(&prompt, session_id.as_deref())
        .await?;
    let session = ChatSessionResponse::from(turn.session.clone());
    let messages = turn
        .messages
        .into_iter()
        .map(ChatMessageResponse::from)
        .collect::<Vec<_>>();
    let provider = Some(ChatProviderResponse::from(turn.provider));
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

    Ok(SendChatPromptResponse {
        session_id: session.id.clone(),
        run_id: None,
        session,
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
    #[tokio::test]
    async fn send_chat_prompt_requires_default_provider() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();

        let error =
            super::send_chat_prompt_inner("summarize today's notes".to_string(), None, &state)
        .await
        .unwrap_err();

        assert!(error.to_string().contains("default provider is not configured"));
    }

    #[tokio::test]
    async fn send_chat_prompt_returns_backend_session_messages_and_provider() {
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

        let response =
            super::send_chat_prompt_inner("summarize today's notes".to_string(), None, &state)
                .await
                .unwrap();

        assert!(!response.session.id.is_empty());
        assert_eq!(response.messages.len(), 2);
        assert_eq!(response.messages[0].content, "summarize today's notes");
        assert_eq!(response.messages[1].role, "assistant");
        assert_eq!(response.provider.as_ref().map(|provider| provider.name.as_str()), Some("Local"));
    }

    #[tokio::test]
    async fn send_chat_prompt_creates_chat_memory_candidate_for_the_session() {
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

        let response = super::send_chat_prompt_inner(
            "capture the release checklist".to_string(),
            None,
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
    async fn send_chat_prompt_returns_direct_chat_output() {
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

        let response =
            super::send_chat_prompt_inner("draft a release flow".to_string(), None, &state)
                .await
                .unwrap();

        assert_eq!(response.output, "Seeded assistant response");
    }

    #[tokio::test]
    async fn send_chat_prompt_exposes_structured_execution_result_metadata() {
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

        let response =
            super::send_chat_prompt_inner("summarize today's notes".to_string(), None, &state)
                .await
                .unwrap();
        let response_json = serde_json::to_value(&response).unwrap();

        assert_eq!(response_json["sessionId"], response.session.id);
        assert!(response_json["runId"].is_null());
        assert_eq!(response_json["output"], response.messages[1].content);
        assert_eq!(response_json["exitStatus"], "completed");
        assert_eq!(response_json["provider"]["id"], provider_id);
        assert_eq!(response_json["provider"]["model"], "gpt-oss");
        assert!(response_json.get("route").is_none());
    }

    #[tokio::test]
    async fn send_chat_prompt_does_not_expose_workflow_ids_in_chat_session_payload() {
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

        let response =
            super::send_chat_prompt_inner("summarize today's notes".to_string(), None, &state)
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
