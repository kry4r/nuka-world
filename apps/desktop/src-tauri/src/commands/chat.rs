use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRouteResponse {
    pub session: ChatSessionResponse,
    pub route: ChatRoute,
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
    pub workflow_id: Option<String>,
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
    ExistingWorkflow { #[serde(rename = "workflowId")] workflow_id: String },
    NewWorkflow,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ChatModeInput {
    ChatOnly,
    CreateWorkflow,
    SpecificWorkflow { #[serde(rename = "workflowId")] workflow_id: String },
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

async fn route_world_prompt_inner(
    prompt: String,
    session_id: Option<String>,
    mode: ChatModeInput,
    state: &crate::app_state::AppState,
) -> anyhow::Result<ChatRouteResponse> {
    let turn = match session_id.as_deref() {
        Some(session_id) => state.world_runtime().continue_session(session_id, &prompt).await,
        None => state.world_runtime().start_session(&prompt, mode.into()).await,
    }?;

    let route = match turn.route {
        nuka_runtime::world::WorldRoute::DirectReply => ChatRoute::DirectReply,
        nuka_runtime::world::WorldRoute::ExistingWorkflow(workflow_id) => {
            ChatRoute::ExistingWorkflow { workflow_id }
        }
        nuka_runtime::world::WorldRoute::NewWorkflow => ChatRoute::NewWorkflow,
    };

    let (session, messages, provider) = match turn.chat_turn {
        Some(chat_turn) => (
            ChatSessionResponse::from(chat_turn.session.clone()),
            vec![ChatMessageResponse::from(chat_turn.user_message)],
            Some(ChatProviderResponse::from(chat_turn.provider)),
        ),
        None => (
            ChatSessionResponse {
                id: turn.session.id.clone(),
                title: prompt.chars().take(48).collect(),
                provider_id: None,
                workflow_id: match &turn.session.mode {
                    nuka_runtime::world::WorldChatMode::SpecificWorkflow(workflow_id) => {
                        Some(workflow_id.clone())
                    }
                    _ => None,
                },
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

    Ok(ChatRouteResponse {
        session,
        route,
        messages,
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
            ChatModeInput::ChatOnly => Self::ChatOnly,
            ChatModeInput::CreateWorkflow => Self::CreateWorkflow,
            ChatModeInput::SpecificWorkflow { workflow_id } => Self::SpecificWorkflow(workflow_id),
        }
    }
}

impl From<nuka_domain::chat::ChatSessionSummary> for ChatSessionResponse {
    fn from(value: nuka_domain::chat::ChatSessionSummary) -> Self {
        Self {
            id: value.id,
            title: value.title,
            provider_id: value.provider_id,
            workflow_id: value.workflow_id,
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
    fn chat_mode_input_deserializes_specific_workflow_from_camel_case_payload() {
        let mode: super::ChatModeInput = serde_json::from_str(
            r#"{"kind":"specific_workflow","workflowId":"workflow-release"}"#,
        )
        .unwrap();

        assert!(matches!(
            mode,
            super::ChatModeInput::SpecificWorkflow { workflow_id }
            if workflow_id == "workflow-release"
        ));
    }

    #[tokio::test]
    async fn route_world_prompt_requires_default_provider() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();

        let error = super::route_world_prompt_inner(
            "summarize today's notes".to_string(),
            None,
            super::ChatModeInput::ChatOnly,
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
            super::ChatModeInput::ChatOnly,
            &state,
        )
        .await
        .unwrap();

        assert!(!response.session.id.is_empty());
        assert_eq!(response.messages.len(), 1);
        assert_eq!(response.messages[0].content, "summarize today's notes");
        assert_eq!(response.provider.as_ref().map(|provider| provider.name.as_str()), Some("Local"));
    }

    #[tokio::test]
    async fn route_world_prompt_accepts_mode_value() {
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
            super::ChatModeInput::CreateWorkflow,
            &state,
        )
        .await
        .unwrap();

        assert!(matches!(response.route, super::ChatRoute::NewWorkflow));
    }

    #[tokio::test]
    async fn route_world_prompt_returns_specific_workflow_route_metadata() {
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
            "focus on the release template".to_string(),
            None,
            super::ChatModeInput::SpecificWorkflow {
                workflow_id: "workflow-release".to_string(),
            },
            &state,
        )
        .await
        .unwrap();

        assert!(matches!(
            response.route,
            super::ChatRoute::ExistingWorkflow { workflow_id }
            if workflow_id == "workflow-release"
        ));
        assert_eq!(response.session.workflow_id.as_deref(), Some("workflow-release"));
    }
}
