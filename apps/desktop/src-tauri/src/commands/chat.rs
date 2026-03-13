use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRouteResponse {
    pub session: ChatSessionResponse,
    pub messages: Vec<ChatMessageResponse>,
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
#[serde(rename_all = "camelCase")]
pub struct PromptExecutionResponse {
    pub exit_status: String,
    pub session_id: String,
    pub run_id: Option<String>,
    pub route: PromptExecutionRoute,
    pub provider: Option<ChatProviderResponse>,
    pub final_output: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptExecutionRoute {
    pub kind: String,
}

#[tauri::command]
pub async fn route_world_prompt(
    prompt: String,
    session_id: Option<String>,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<ChatRouteResponse, String> {
    route_world_prompt_inner(prompt, session_id, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn execute_prompt_json(
    prompt: String,
    session_id: Option<String>,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<PromptExecutionResponse, String> {
    execute_prompt_json_inner(prompt, session_id, &state)
        .await
        .map_err(|error| error.to_string())
}

async fn route_world_prompt_inner(
    prompt: String,
    session_id: Option<String>,
    state: &crate::app_state::AppState,
) -> anyhow::Result<ChatRouteResponse> {
    let prompt_for_memory = prompt.clone();
    let turn = match session_id.as_deref() {
        Some(session_id) => state.world_runtime().continue_session(session_id, &prompt).await,
        None => state.world_runtime().start_session(&prompt).await,
    }?;
    let chat_turn = turn.chat_turn;
    let session = ChatSessionResponse::from(chat_turn.session.clone());
    let messages = chat_turn
        .messages
        .into_iter()
        .map(ChatMessageResponse::from)
        .collect();
    let provider = Some(ChatProviderResponse::from(chat_turn.provider));

    state
        .memory_service()
        .handle_runtime_event(nuka_runtime::runtime_events::RuntimeEvent::ChatTurnCompleted {
            session_id: session.id.clone(),
            prompt: prompt_for_memory,
        })
        .await?;

    Ok(ChatRouteResponse {
        session,
        messages,
        provider,
        context: ChatContextResponse {
            attached_agents: Vec::new(),
            attached_knowledge_libraries: Vec::new(),
        },
    })
}

async fn execute_prompt_json_inner(
    prompt: String,
    session_id: Option<String>,
    state: &crate::app_state::AppState,
) -> anyhow::Result<PromptExecutionResponse> {
    let response = route_world_prompt_inner(prompt, session_id, state).await?;
    let final_output = response
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "assistant")
        .or_else(|| response.messages.last())
        .map(|message| message.content.clone())
        .unwrap_or_default();

    Ok(PromptExecutionResponse {
        exit_status: "success".to_string(),
        session_id: response.session.id,
        run_id: None,
        route: PromptExecutionRoute {
            kind: "direct_reply".to_string(),
        },
        provider: response.provider,
        final_output,
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
    async fn route_world_prompt_requires_default_provider() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();

        let error = super::route_world_prompt_inner("summarize today's notes".to_string(), None, &state)
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

        let response = super::route_world_prompt_inner("summarize today's notes".to_string(), None, &state)
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

        let response =
            super::route_world_prompt_inner("capture the release checklist".to_string(), None, &state)
                .await
                .unwrap();
        let pending = state.memory_service().list_pending_candidates().await.unwrap();

        assert!(pending.iter().any(|candidate| {
            candidate.surface == nuka_domain::memory::MemorySurface::Chat
                && candidate.owner_id == response.session.id
        }));
    }

    #[tokio::test]
    async fn route_world_prompt_continues_an_existing_direct_chat_session() {
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

        let first = super::route_world_prompt_inner("summarize today's notes".to_string(), None, &state)
            .await
            .unwrap();
        let next = super::route_world_prompt_inner(
            "continue the same conversation".to_string(),
            Some(first.session.id.clone()),
            &state,
        )
        .await
        .unwrap();

        assert_eq!(next.session.id, first.session.id);
        assert_eq!(next.messages.len(), 2);
        assert_eq!(next.messages[0].content, "continue the same conversation");
    }

    #[tokio::test]
    async fn execute_prompt_json_returns_machine_readable_result_for_direct_chat() {
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

        assert_eq!(response.exit_status, "success");
        assert_eq!(response.run_id, None);
        assert!(!response.session_id.is_empty());
        assert_eq!(response.route.kind, "direct_reply");
        assert_eq!(response.provider.as_ref().map(|item| item.id.as_str()), Some(provider_id.as_str()));
        assert!(!response.final_output.is_empty());
    }

    #[tokio::test]
    async fn execute_prompt_json_persists_desktop_owned_chat_session() {
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
            "capture the release checklist".to_string(),
            None,
            &state,
        )
        .await
        .unwrap();

        let loaded = state
            .workspace_sessions_service()
            .load(
                &response.session_id,
                nuka_runtime::workspace_sessions::WorkspaceSessionKind::DirectChat,
            )
            .await
            .unwrap();

        match loaded {
            Some(nuka_runtime::workspace_sessions::WorkspaceSessionDetail::DirectChat {
                session,
                messages,
            }) => {
                assert_eq!(session.id, response.session_id);
                assert_eq!(messages.len(), 2);
                assert_eq!(messages[0].content, "capture the release checklist");
            }
            other => panic!("expected persisted direct chat session, got {other:?}"),
        }
    }
}
