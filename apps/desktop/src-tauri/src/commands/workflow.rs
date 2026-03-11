use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WorkflowEventResponse {
    UserMessage { id: String, content: String },
    AssistantMessage { id: String, content: String },
    NodeEvent {
        id: String,
        title: String,
        status: String,
        detail: Option<String>,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowSessionResponse {
    pub session_id: String,
    pub workflow_id: String,
    pub inputs: std::collections::BTreeMap<String, String>,
    pub origin: Option<WorkflowOriginResponse>,
    pub status: String,
    pub events: Vec<WorkflowEventResponse>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowOriginInput {
    pub source_session_id: String,
    pub source_mode: WorkflowSourceModeInput,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowSourceModeInput {
    CreateWorkflow,
    SpecificWorkflow,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowOriginResponse {
    pub source_session_id: String,
    pub source_mode: WorkflowSourceModeResponse,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowSourceModeResponse {
    CreateWorkflow,
    SpecificWorkflow,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowExplanationResponse {
    pub workflow_id: String,
    pub title: String,
    pub summary: String,
    pub steps: Vec<WorkflowExplanationStepResponse>,
    pub dependencies: WorkflowDependenciesResponse,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowExplanationStepResponse {
    pub id: String,
    pub title: String,
    pub purpose: String,
    pub executor: String,
    pub input_source: String,
    pub output: String,
    pub completion: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowDependenciesResponse {
    pub agents: Vec<String>,
    pub tools_and_knowledge: Vec<String>,
    pub required_inputs: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRevisionPreviewResponse {
    pub workflow_id: String,
    pub prompt: String,
    pub change_summary: String,
    pub step_changes: Vec<String>,
    pub dependency_changes: Vec<String>,
    pub outcome_changes: Vec<String>,
}

#[tauri::command]
pub async fn start_workflow_session(
    workflow_id: String,
    inputs: Option<std::collections::BTreeMap<String, String>>,
    origin: Option<WorkflowOriginInput>,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<WorkflowSessionResponse, String> {
    start_workflow_session_inner(workflow_id, inputs, origin, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn explain_workflow(
    workflow_id: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<WorkflowExplanationResponse, String> {
    explain_workflow_inner(workflow_id, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn revise_workflow(
    workflow_id: String,
    prompt: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<WorkflowRevisionPreviewResponse, String> {
    revise_workflow_inner(workflow_id, prompt, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn continue_workflow_session(
    session_id: String,
    prompt: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<WorkflowSessionResponse, String> {
    continue_workflow_session_inner(session_id, prompt, &state)
        .await
        .map_err(|error| error.to_string())
}

async fn start_workflow_session_inner(
    workflow_id: String,
    inputs: Option<std::collections::BTreeMap<String, String>>,
    origin: Option<WorkflowOriginInput>,
    state: &crate::app_state::AppState,
) -> anyhow::Result<WorkflowSessionResponse> {
    let inputs = inputs.unwrap_or_default();
    let prompt = memory_prompt_for_workflow(&workflow_id, &inputs);
    let session = state
        .workflow_world_runtime()
        .start_saved_workflow_session_with_inputs_and_origin(
            &workflow_id,
            inputs.clone(),
            origin.map(Into::into),
        )
        .await?;

    state
        .memory_service()
        .handle_runtime_event(nuka_runtime::runtime_events::RuntimeEvent::WorkflowSessionStarted {
            session_id: session.id.clone(),
            workflow_id: session.workflow_id.clone(),
            prompt,
        })
        .await?;

    Ok(WorkflowSessionResponse::from(session))
}

async fn continue_workflow_session_inner(
    session_id: String,
    prompt: String,
    state: &crate::app_state::AppState,
) -> anyhow::Result<WorkflowSessionResponse> {
    let prompt_for_memory = prompt.clone();
    let session = state
        .workflow_world_runtime()
        .continue_saved_workflow_session(&session_id, &prompt)
        .await?;

    state
        .memory_service()
        .handle_runtime_event(nuka_runtime::runtime_events::RuntimeEvent::WorkflowTurnCompleted {
            session_id: session.id.clone(),
            workflow_id: session.workflow_id.clone(),
            prompt: prompt_for_memory,
        })
        .await?;

    Ok(WorkflowSessionResponse::from(session))
}

async fn explain_workflow_inner(
    workflow_id: String,
    _state: &crate::app_state::AppState,
) -> anyhow::Result<WorkflowExplanationResponse> {
    Ok(WorkflowExplanationResponse::from(
        nuka_runtime::workflow::explain_template(&workflow_id).await?,
    ))
}

async fn revise_workflow_inner(
    workflow_id: String,
    prompt: String,
    _state: &crate::app_state::AppState,
) -> anyhow::Result<WorkflowRevisionPreviewResponse> {
    Ok(WorkflowRevisionPreviewResponse::from(
        nuka_runtime::workflow::preview_template_revision(&workflow_id, &prompt).await?,
    ))
}

fn memory_prompt_for_workflow(
    workflow_id: &str,
    inputs: &std::collections::BTreeMap<String, String>,
) -> String {
    if let Some(prompt) = inputs
        .get("goal")
        .or_else(|| inputs.get("releaseScope"))
        .or_else(|| inputs.get("issueSummary"))
        .filter(|value| !value.trim().is_empty())
    {
        return prompt.clone();
    }

    match workflow_id {
        "workflow-release-notes" => "Prepare the release notes workflow room.".to_string(),
        "workflow-customer-triage" => "Open the customer triage workflow room.".to_string(),
        _ => "Prepare a product launch brief".to_string(),
    }
}

impl From<nuka_runtime::workflow::WorkflowSession> for WorkflowSessionResponse {
    fn from(value: nuka_runtime::workflow::WorkflowSession) -> Self {
        Self {
            session_id: value.id,
            workflow_id: value.workflow_id,
            inputs: value.inputs,
            origin: value.origin.map(WorkflowOriginResponse::from),
            status: value.status,
            events: value.events.into_iter().map(WorkflowEventResponse::from).collect(),
        }
    }
}

impl From<WorkflowOriginInput> for nuka_runtime::workflow::WorkflowOrigin {
    fn from(value: WorkflowOriginInput) -> Self {
        Self {
            source_session_id: value.source_session_id,
            source_mode: value.source_mode.into(),
        }
    }
}

impl From<WorkflowSourceModeInput> for nuka_runtime::workflow::WorkflowSourceMode {
    fn from(value: WorkflowSourceModeInput) -> Self {
        match value {
            WorkflowSourceModeInput::CreateWorkflow => Self::CreateWorkflow,
            WorkflowSourceModeInput::SpecificWorkflow => Self::SpecificWorkflow,
        }
    }
}

impl From<nuka_runtime::workflow::WorkflowOrigin> for WorkflowOriginResponse {
    fn from(value: nuka_runtime::workflow::WorkflowOrigin) -> Self {
        Self {
            source_session_id: value.source_session_id,
            source_mode: value.source_mode.into(),
        }
    }
}

impl From<nuka_runtime::workflow::WorkflowSourceMode> for WorkflowSourceModeResponse {
    fn from(value: nuka_runtime::workflow::WorkflowSourceMode) -> Self {
        match value {
            nuka_runtime::workflow::WorkflowSourceMode::CreateWorkflow => Self::CreateWorkflow,
            nuka_runtime::workflow::WorkflowSourceMode::SpecificWorkflow => Self::SpecificWorkflow,
        }
    }
}

impl From<nuka_runtime::workflow::WorkflowEvent> for WorkflowEventResponse {
    fn from(value: nuka_runtime::workflow::WorkflowEvent) -> Self {
        match value {
            nuka_runtime::workflow::WorkflowEvent::UserMessage { id, content } => {
                Self::UserMessage { id, content }
            }
            nuka_runtime::workflow::WorkflowEvent::AssistantMessage { id, content } => {
                Self::AssistantMessage { id, content }
            }
            nuka_runtime::workflow::WorkflowEvent::NodeEvent {
                id,
                title,
                status,
                detail,
            } => Self::NodeEvent {
                id,
                title,
                status,
                detail,
            },
        }
    }
}

impl From<nuka_domain::workflow::WorkflowExplanation> for WorkflowExplanationResponse {
    fn from(value: nuka_domain::workflow::WorkflowExplanation) -> Self {
        Self {
            workflow_id: value.workflow_id,
            title: value.title,
            summary: value.summary,
            steps: value
                .steps
                .into_iter()
                .map(WorkflowExplanationStepResponse::from)
                .collect(),
            dependencies: WorkflowDependenciesResponse::from(value.dependencies),
        }
    }
}

impl From<nuka_domain::workflow::WorkflowExplanationStep> for WorkflowExplanationStepResponse {
    fn from(value: nuka_domain::workflow::WorkflowExplanationStep) -> Self {
        Self {
            id: value.id,
            title: value.title,
            purpose: value.purpose,
            executor: value.executor,
            input_source: value.input_source,
            output: value.output,
            completion: value.completion,
        }
    }
}

impl From<nuka_domain::workflow::WorkflowDependencies> for WorkflowDependenciesResponse {
    fn from(value: nuka_domain::workflow::WorkflowDependencies) -> Self {
        Self {
            agents: value.agents,
            tools_and_knowledge: value.tools_and_knowledge,
            required_inputs: value.required_inputs,
        }
    }
}

impl From<nuka_domain::workflow::WorkflowRevisionPreview> for WorkflowRevisionPreviewResponse {
    fn from(value: nuka_domain::workflow::WorkflowRevisionPreview) -> Self {
        Self {
            workflow_id: value.workflow_id,
            prompt: value.prompt,
            change_summary: value.change_summary,
            step_changes: value.step_changes,
            dependency_changes: value.dependency_changes,
            outcome_changes: value.outcome_changes,
        }
    }
}

#[cfg(test)]
mod tests {
    async fn configure_default_provider(state: &crate::app_state::AppState) {
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
    }

    #[tokio::test]
    async fn start_workflow_session_returns_room_ready_transcript_and_timeline() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        configure_default_provider(&state).await;
        let mut inputs = std::collections::BTreeMap::new();
        inputs.insert("goal".to_string(), "ship task eight".to_string());

        let session = super::start_workflow_session_inner(
            "workflow-release".to_string(),
            Some(inputs.clone()),
            None,
            &state,
        )
        .await
        .unwrap();

        assert_eq!(session.workflow_id, "workflow-release");
        assert_eq!(session.inputs, inputs);
        assert_eq!(session.status, "active");
        assert!(session.events.len() >= 3);
        assert!(matches!(
            session.events[0],
            super::WorkflowEventResponse::UserMessage { ref content, .. }
                if content == "ship task eight"
        ));
        assert!(matches!(
            session.events[1],
            super::WorkflowEventResponse::AssistantMessage { .. }
        ));
        assert!(matches!(
            session.events[2],
            super::WorkflowEventResponse::NodeEvent { .. }
        ));
    }

    #[tokio::test]
    async fn start_workflow_session_keeps_chat_handoff_origin() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        configure_default_provider(&state).await;
        let session = super::start_workflow_session_inner(
            "workflow-release".to_string(),
            Some(std::collections::BTreeMap::from([(
                "releaseScope".to_string(),
                "Review the release checklist".to_string(),
            )])),
            Some(super::WorkflowOriginInput {
                source_session_id: "chat-session-42".to_string(),
                source_mode: super::WorkflowSourceModeInput::SpecificWorkflow,
            }),
            &state,
        )
        .await
        .unwrap();

        assert!(matches!(
            session.origin,
            Some(super::WorkflowOriginResponse {
                source_session_id,
                source_mode: super::WorkflowSourceModeResponse::SpecificWorkflow,
            }) if source_session_id == "chat-session-42"
        ));
        assert!(matches!(
            session.events[0],
            super::WorkflowEventResponse::UserMessage { ref content, .. }
                if content == "Review the release checklist"
        ));
    }

    #[tokio::test]
    async fn start_workflow_session_creates_memory_candidate_for_the_room_session() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        configure_default_provider(&state).await;

        let session = super::start_workflow_session_inner(
            "workflow-release-notes".to_string(),
            Some(std::collections::BTreeMap::from([(
                "releaseScope".to_string(),
                "Review the release checklist".to_string(),
            )])),
            None,
            &state,
        )
        .await
        .unwrap();
        let pending = state.memory_service().list_pending_candidates().await.unwrap();

        assert!(pending.iter().any(|candidate| {
            candidate.surface == nuka_domain::memory::MemorySurface::Workflow
                && candidate.owner_id == session.session_id
        }));
    }

    #[tokio::test]
    async fn continue_workflow_session_keeps_session_and_appends_follow_up_prompt() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        configure_default_provider(&state).await;
        let session = super::start_workflow_session_inner(
            "workflow-release".to_string(),
            None,
            None,
            &state,
        )
        .await
        .unwrap();

        let continued = super::continue_workflow_session_inner(
            session.session_id.clone(),
            "refine the handoff checklist".to_string(),
            &state,
        )
        .await
        .unwrap();

        assert_eq!(continued.session_id, session.session_id);
        assert!(continued.events.iter().any(|event| matches!(
            event,
            super::WorkflowEventResponse::UserMessage { content, .. }
                if content == "refine the handoff checklist"
        )));
    }

    #[tokio::test]
    async fn continue_workflow_session_returns_provider_backed_assistant_output() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        configure_default_provider(&state).await;

        let session = super::start_workflow_session_inner(
            "workflow-release-notes".to_string(),
            Some(std::collections::BTreeMap::from([(
                "releaseScope".to_string(),
                "Review the release checklist".to_string(),
            )])),
            None,
            &state,
        )
        .await
        .unwrap();

        let continued = super::continue_workflow_session_inner(
            session.session_id.clone(),
            "turn this into a handoff".to_string(),
            &state,
        )
        .await
        .unwrap();

        assert!(continued.events.iter().any(|event| matches!(
            event,
            super::WorkflowEventResponse::AssistantMessage { content, .. }
                if content.contains("handoff")
        )));
    }

    #[tokio::test]
    async fn explain_workflow_returns_readable_explanation_model() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();

        let explanation = super::explain_workflow_inner(
            "workflow-release-notes".to_string(),
            &state,
        )
        .await
        .unwrap();

        assert_eq!(explanation.workflow_id, "workflow-release-notes");
        assert!(!explanation.steps.is_empty());
        assert!(explanation.steps[0].executor.len() > 0);
    }

    #[tokio::test]
    async fn revise_workflow_returns_preview_without_overwriting_template() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();

        let preview = super::revise_workflow_inner(
            "workflow-release-notes".to_string(),
            "Search the knowledge base before drafting".to_string(),
            &state,
        )
        .await
        .unwrap();

        assert_eq!(preview.workflow_id, "workflow-release-notes");
        assert!(!preview.change_summary.is_empty());
        assert!(!preview.step_changes.is_empty());
    }
}
