use serde::Serialize;

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

async fn route_world_prompt_inner(
    prompt: String,
    session_id: Option<String>,
    state: &crate::app_state::AppState,
) -> anyhow::Result<ChatRouteResponse> {
    let turn = match session_id.as_deref() {
        Some(session_id) => state.world_runtime().continue_session(session_id, &prompt).await,
        None => state.world_runtime().start_session(&prompt).await,
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
                workflow_id: None,
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
    #[tokio::test]
    async fn route_world_prompt_requires_default_provider() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();

        let error = super::route_world_prompt_inner(
            "summarize today's notes".to_string(),
            None,
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
            &state,
        )
        .await
        .unwrap();

        assert!(!response.session.id.is_empty());
        assert_eq!(response.messages.len(), 1);
        assert_eq!(response.messages[0].content, "summarize today's notes");
        assert_eq!(response.provider.as_ref().map(|provider| provider.name.as_str()), Some("Local"));
    }
}
