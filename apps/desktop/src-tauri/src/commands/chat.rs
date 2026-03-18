use serde::{Deserialize, Serialize};
use tauri::Emitter;

const CHAT_STREAM_EVENT: &str = "nuka://chat-stream";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatRouteResponse {
    pub session: ChatSessionResponse,
    pub messages: Vec<ChatMessageResponse>,
    pub provider: Option<ChatProviderResponse>,
    pub routing: Option<ProviderRoutingResponse>,
    pub context: ChatContextResponse,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatSessionResponse {
    pub id: String,
    pub title: String,
    pub provider_id: Option<String>,
    pub message_count: usize,
    pub routing: Option<ProviderRoutingResponse>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageResponse {
    pub id: String,
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatProviderResponse {
    pub id: String,
    pub name: String,
    pub model: String,
    pub base_url: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatContextResponse {
    pub attached_agents: Vec<String>,
    pub attached_knowledge_libraries: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRoutingInput {
    pub requested_provider_id: Option<String>,
    pub requested_model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRoutingResponse {
    pub requested_provider_id: Option<String>,
    pub requested_model: Option<String>,
    pub effective_provider_id: String,
    pub effective_model: String,
    pub fallback_provider_id: Option<String>,
    pub failover_reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptExecutionResponse {
    pub exit_status: String,
    pub session_id: String,
    pub run_id: Option<String>,
    pub route: PromptExecutionRoute,
    pub provider: Option<ChatProviderResponse>,
    pub routing: Option<ProviderRoutingResponse>,
    pub final_output: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptExecutionRoute {
    pub kind: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatStreamEventResponse {
    pub request_id: String,
    pub kind: String,
    pub session: Option<ChatSessionResponse>,
    pub provider: Option<ChatProviderResponse>,
    pub routing: Option<ProviderRoutingResponse>,
    pub delta: Option<String>,
    pub response: Option<ChatRouteResponse>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn route_world_prompt(
    prompt: String,
    session_id: Option<String>,
    routing: Option<ProviderRoutingInput>,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<ChatRouteResponse, String> {
    route_world_prompt_inner(prompt, session_id, routing, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn route_world_prompt_stream(
    request_id: String,
    prompt: String,
    session_id: Option<String>,
    routing: Option<ProviderRoutingInput>,
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<(), String> {
    let world_runtime = state.world_runtime().clone();
    let memory_service = state.memory_service().clone();

    tauri::async_runtime::spawn(async move {
        let prompt_for_memory = prompt.clone();
        let streaming_result = async {
            let turn = match session_id.as_deref() {
                Some(session_id) => {
                    world_runtime
                        .continue_session_with_route_streaming(
                            session_id,
                            &prompt,
                            routing
                                .clone()
                                .map(nuka_domain::provider::ProviderRouteRequest::from),
                            |session, provider| {
                                emit_chat_stream_event(
                                    &app,
                                    ChatStreamEventResponse {
                                        request_id: request_id.clone(),
                                        kind: "started".to_string(),
                                        session: Some(ChatSessionResponse::from(session.clone())),
                                        provider: Some(ChatProviderResponse::from(
                                            provider.clone(),
                                        )),
                                        routing: session
                                            .routing
                                            .clone()
                                            .map(ProviderRoutingResponse::from),
                                        delta: None,
                                        response: None,
                                        error: None,
                                    },
                                )
                            },
                            |delta| {
                                emit_chat_stream_event(
                                    &app,
                                    ChatStreamEventResponse {
                                        request_id: request_id.clone(),
                                        kind: "delta".to_string(),
                                        session: None,
                                        provider: None,
                                        routing: None,
                                        delta: Some(delta.to_string()),
                                        response: None,
                                        error: None,
                                    },
                                )
                            },
                        )
                        .await
                }
                None => {
                    world_runtime
                        .start_session_with_route_streaming(
                            &prompt,
                            routing
                                .clone()
                                .map(nuka_domain::provider::ProviderRouteRequest::from),
                            |session, provider| {
                                emit_chat_stream_event(
                                    &app,
                                    ChatStreamEventResponse {
                                        request_id: request_id.clone(),
                                        kind: "started".to_string(),
                                        session: Some(ChatSessionResponse::from(session.clone())),
                                        provider: Some(ChatProviderResponse::from(
                                            provider.clone(),
                                        )),
                                        routing: session
                                            .routing
                                            .clone()
                                            .map(ProviderRoutingResponse::from),
                                        delta: None,
                                        response: None,
                                        error: None,
                                    },
                                )
                            },
                            |delta| {
                                emit_chat_stream_event(
                                    &app,
                                    ChatStreamEventResponse {
                                        request_id: request_id.clone(),
                                        kind: "delta".to_string(),
                                        session: None,
                                        provider: None,
                                        routing: None,
                                        delta: Some(delta.to_string()),
                                        response: None,
                                        error: None,
                                    },
                                )
                            },
                        )
                        .await
                }
            }?;

            let chat_turn = turn.chat_turn;
            let session = ChatSessionResponse::from(chat_turn.session.clone());
            let messages = chat_turn
                .messages
                .into_iter()
                .map(ChatMessageResponse::from)
                .collect();
            let provider = Some(ChatProviderResponse::from(chat_turn.provider));
            let routing = chat_turn
                .session
                .routing
                .clone()
                .map(ProviderRoutingResponse::from);

            memory_service
                .handle_runtime_event(
                    nuka_runtime::runtime_events::RuntimeEvent::ChatTurnCompleted {
                        session_id: session.id.clone(),
                        prompt: prompt_for_memory,
                    },
                )
                .await?;

            let response = ChatRouteResponse {
                session,
                messages,
                provider,
                routing,
                context: ChatContextResponse {
                    attached_agents: Vec::new(),
                    attached_knowledge_libraries: Vec::new(),
                },
            };

            emit_chat_stream_event(
                &app,
                ChatStreamEventResponse {
                    request_id: request_id.clone(),
                    kind: "completed".to_string(),
                    session: None,
                    provider: None,
                    routing: None,
                    delta: None,
                    response: Some(response),
                    error: None,
                },
            )
        }
        .await;

        if let Err(error) = streaming_result {
            let _ = emit_chat_stream_event(
                &app,
                ChatStreamEventResponse {
                    request_id,
                    kind: "error".to_string(),
                    session: None,
                    provider: None,
                    routing: None,
                    delta: None,
                    response: None,
                    error: Some(error.to_string()),
                },
            );
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn execute_prompt_json(
    prompt: String,
    session_id: Option<String>,
    routing: Option<ProviderRoutingInput>,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<PromptExecutionResponse, String> {
    execute_prompt_json_inner(prompt, session_id, routing, &state)
        .await
        .map_err(|error| error.to_string())
}

pub(crate) async fn route_world_prompt_inner(
    prompt: String,
    session_id: Option<String>,
    routing: Option<ProviderRoutingInput>,
    state: &crate::app_state::AppState,
) -> anyhow::Result<ChatRouteResponse> {
    let prompt_for_memory = prompt.clone();
    let turn = match session_id.as_deref() {
        Some(session_id) => {
            state
                .world_runtime()
                .continue_session_with_route(
                    session_id,
                    &prompt,
                    routing
                        .clone()
                        .map(nuka_domain::provider::ProviderRouteRequest::from),
                )
                .await
        }
        None => {
            state
                .world_runtime()
                .start_session_with_route(
                    &prompt,
                    routing.map(nuka_domain::provider::ProviderRouteRequest::from),
                )
                .await
        }
    }?;
    let chat_turn = turn.chat_turn;
    let session = ChatSessionResponse::from(chat_turn.session.clone());
    let messages = chat_turn
        .messages
        .into_iter()
        .map(ChatMessageResponse::from)
        .collect();
    let provider = Some(ChatProviderResponse::from(chat_turn.provider));
    let routing = chat_turn
        .session
        .routing
        .clone()
        .map(ProviderRoutingResponse::from);

    state
        .memory_service()
        .handle_runtime_event(
            nuka_runtime::runtime_events::RuntimeEvent::ChatTurnCompleted {
                session_id: session.id.clone(),
                prompt: prompt_for_memory,
            },
        )
        .await?;

    Ok(ChatRouteResponse {
        session,
        messages,
        provider,
        routing,
        context: ChatContextResponse {
            attached_agents: Vec::new(),
            attached_knowledge_libraries: Vec::new(),
        },
    })
}

async fn execute_prompt_json_inner(
    prompt: String,
    session_id: Option<String>,
    routing: Option<ProviderRoutingInput>,
    state: &crate::app_state::AppState,
) -> anyhow::Result<PromptExecutionResponse> {
    let response = route_world_prompt_inner(prompt, session_id, routing, state).await?;
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
        routing: response.routing,
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
            routing: value.routing.map(ProviderRoutingResponse::from),
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

impl From<ProviderRoutingInput> for nuka_domain::provider::ProviderRouteRequest {
    fn from(value: ProviderRoutingInput) -> Self {
        Self {
            requested_provider_id: value.requested_provider_id,
            requested_model: value.requested_model,
        }
    }
}

impl From<nuka_domain::provider::ProviderRouteState> for ProviderRoutingResponse {
    fn from(value: nuka_domain::provider::ProviderRouteState) -> Self {
        Self {
            requested_provider_id: value.requested_provider_id,
            requested_model: value.requested_model,
            effective_provider_id: value.effective_provider_id,
            effective_model: value.effective_model,
            fallback_provider_id: value.fallback_provider_id,
            failover_reason: value.failover_reason,
        }
    }
}

fn emit_chat_stream_event(
    app: &tauri::AppHandle,
    payload: ChatStreamEventResponse,
) -> anyhow::Result<()> {
    app.emit(CHAT_STREAM_EVENT, payload)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    async fn configure_provider_chain(
        state: &crate::app_state::AppState,
        default_provider: nuka_domain::provider::ProviderConfig,
        fallback_provider: nuka_domain::provider::ProviderConfig,
    ) {
        state
            .provider_service()
            .save_provider(default_provider.clone())
            .await
            .unwrap();
        state
            .provider_service()
            .save_provider(fallback_provider)
            .await
            .unwrap();
        state
            .provider_service()
            .set_default_provider(&default_provider.id)
            .await
            .unwrap();
        state
            .settings_service()
            .save_state_value(
                "settings.providers",
                r#"{"fallbackProviderId":"provider-fallback","connectionChecks":true}"#,
            )
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn route_world_prompt_requires_default_provider() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();

        let error = super::route_world_prompt_inner(
            "summarize today's notes".to_string(),
            None,
            None,
            &state,
        )
        .await
        .unwrap_err();

        assert!(error
            .to_string()
            .contains("default provider is not configured"));
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

        state
            .provider_service()
            .save_provider(provider)
            .await
            .unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let response = super::route_world_prompt_inner(
            "summarize today's notes".to_string(),
            None,
            None,
            &state,
        )
        .await
        .unwrap();

        assert!(!response.session.id.is_empty());
        assert_eq!(response.messages.len(), 2);
        assert_eq!(response.messages[0].content, "summarize today's notes");
        assert_eq!(response.messages[1].role, "assistant");
        assert_eq!(
            response
                .provider
                .as_ref()
                .map(|provider| provider.name.as_str()),
            Some("Local")
        );
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

        state
            .provider_service()
            .save_provider(provider)
            .await
            .unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let response = super::route_world_prompt_inner(
            "capture the release checklist".to_string(),
            None,
            None,
            &state,
        )
        .await
        .unwrap();
        let pending = state
            .memory_service()
            .list_pending_candidates()
            .await
            .unwrap();

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

        state
            .provider_service()
            .save_provider(provider)
            .await
            .unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let first = super::route_world_prompt_inner(
            "summarize today's notes".to_string(),
            None,
            None,
            &state,
        )
        .await
        .unwrap();
        let next = super::route_world_prompt_inner(
            "continue the same conversation".to_string(),
            Some(first.session.id.clone()),
            None,
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

        state
            .provider_service()
            .save_provider(provider)
            .await
            .unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let response = super::execute_prompt_json_inner(
            "summarize today's notes".to_string(),
            None,
            None,
            &state,
        )
        .await
        .unwrap();

        assert_eq!(response.exit_status, "success");
        assert_eq!(response.run_id, None);
        assert!(!response.session_id.is_empty());
        assert_eq!(response.route.kind, "direct_reply");
        assert_eq!(
            response.provider.as_ref().map(|item| item.id.as_str()),
            Some(provider_id.as_str())
        );
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

        state
            .provider_service()
            .save_provider(provider)
            .await
            .unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let response = super::execute_prompt_json_inner(
            "capture the release checklist".to_string(),
            None,
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

    #[tokio::test]
    async fn route_world_prompt_exposes_effective_routing_metadata_after_fallback() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
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
        configure_provider_chain(&state, broken_provider, fallback_provider).await;

        let response = super::route_world_prompt_inner(
            "summarize today's notes".to_string(),
            None,
            None,
            &state,
        )
        .await
        .unwrap();
        let response_json = serde_json::to_value(&response).unwrap();

        assert_eq!(response_json["provider"]["id"], "provider-fallback");
        assert_eq!(
            response_json["session"]["routing"]["effectiveProviderId"],
            "provider-fallback"
        );
        assert_eq!(
            response_json["session"]["routing"]["effectiveModel"],
            "gpt-oss-fallback"
        );
        assert_eq!(
            response_json["session"]["routing"]["fallbackProviderId"],
            "provider-fallback"
        );
        assert_eq!(
            response_json["session"]["routing"]["failoverReason"],
            "missing_model"
        );
    }
}
