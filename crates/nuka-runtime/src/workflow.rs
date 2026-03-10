#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkflowEvent {
    UserMessage { id: String, content: String },
    AssistantMessage { id: String, content: String },
    NodeEvent {
        id: String,
        title: String,
        status: String,
        detail: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkflowSourceMode {
    CreateWorkflow,
    SpecificWorkflow,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkflowOrigin {
    pub source_session_id: String,
    pub source_mode: WorkflowSourceMode,
}

#[derive(Debug, Clone)]
pub struct WorkflowSession {
    pub id: String,
    pub workflow_id: String,
    pub inputs: std::collections::BTreeMap<String, String>,
    pub origin: Option<WorkflowOrigin>,
    pub status: String,
    pub events: Vec<WorkflowEvent>,
}

#[derive(Debug, Clone)]
pub struct WorkflowRuntime {
    chat_service: crate::chat_service::ChatService,
    sessions: std::sync::Arc<std::sync::Mutex<std::collections::BTreeMap<String, WorkflowSession>>>,
}

impl Default for WorkflowRuntime {
    fn default() -> Self {
        Self::new(crate::chat_service::ChatService::new_for_test_with_default_provider())
    }
}

impl WorkflowRuntime {
    pub fn new(chat_service: crate::chat_service::ChatService) -> Self {
        Self {
            chat_service,
            sessions: std::sync::Arc::new(std::sync::Mutex::new(
                std::collections::BTreeMap::new(),
            )),
        }
    }

    pub fn new_for_test() -> Self {
        Self::default()
    }

    pub fn new_for_test_with_provider() -> Self {
        Self::default()
    }

    pub async fn start_session(&self, workflow_id: &str) -> anyhow::Result<WorkflowSession> {
        self.start_session_with_inputs_and_origin(
            workflow_id,
            std::collections::BTreeMap::new(),
            None,
        )
        .await
    }

    pub async fn start_session_with_inputs(
        &self,
        workflow_id: &str,
        inputs: std::collections::BTreeMap<String, String>,
    ) -> anyhow::Result<WorkflowSession> {
        self.start_session_with_inputs_and_origin(workflow_id, inputs, None)
            .await
    }

    pub async fn start_session_with_inputs_and_origin(
        &self,
        workflow_id: &str,
        inputs: std::collections::BTreeMap<String, String>,
        origin: Option<WorkflowOrigin>,
    ) -> anyhow::Result<WorkflowSession> {
        let initial_prompt = initial_prompt(workflow_id, &inputs);
        let provider = self
            .chat_service
            .prepare_provider_for_prompt(&initial_prompt)
            .await?;
        let session = WorkflowSession {
            id: uuid::Uuid::new_v4().to_string(),
            workflow_id: workflow_id.to_string(),
            events: seed_events(workflow_id, &initial_prompt, &provider),
            inputs,
            origin,
            status: "active".to_string(),
        };

        self.sessions
            .lock()
            .map_err(|_| anyhow::anyhow!("workflow runtime lock poisoned"))?
            .insert(session.id.clone(), session.clone());

        Ok(session)
    }

    pub async fn continue_session(
        &self,
        session_id: &str,
        prompt: &str,
    ) -> anyhow::Result<WorkflowSession> {
        let provider = self
            .chat_service
            .prepare_provider_for_prompt(prompt)
            .await?;
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| anyhow::anyhow!("workflow runtime lock poisoned"))?;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| anyhow::anyhow!("workflow session not found: {session_id}"))?;

        session.events.push(WorkflowEvent::UserMessage {
            id: uuid::Uuid::new_v4().to_string(),
            content: prompt.to_string(),
        });
        session.events.push(WorkflowEvent::AssistantMessage {
            id: uuid::Uuid::new_v4().to_string(),
            content: continue_assistant_message(&provider, &session.workflow_id, prompt),
        });
        session.events.push(WorkflowEvent::NodeEvent {
            id: uuid::Uuid::new_v4().to_string(),
            title: "Draft follow-up".to_string(),
            status: "running".to_string(),
            detail: Some(format!(
                "Provider-backed workflow execution is expanding the room for: {prompt}"
            )),
        });
        session.status = "active".to_string();

        Ok(session.clone())
    }
}

fn seed_events(
    workflow_id: &str,
    initial_prompt: &str,
    provider: &nuka_domain::provider::ProviderConfig,
) -> Vec<WorkflowEvent> {
    vec![
        WorkflowEvent::UserMessage {
            id: uuid::Uuid::new_v4().to_string(),
            content: initial_prompt.to_string(),
        },
        WorkflowEvent::AssistantMessage {
            id: uuid::Uuid::new_v4().to_string(),
            content: start_assistant_message(provider, workflow_id, initial_prompt),
        },
        WorkflowEvent::NodeEvent {
            id: uuid::Uuid::new_v4().to_string(),
            title: "Scope intake".to_string(),
            status: "completed".to_string(),
            detail: Some(format!(
                "Provider-backed workflow intake captured the requested scope for: {initial_prompt}"
            )),
        },
    ]
}

fn start_assistant_message(
    provider: &nuka_domain::provider::ProviderConfig,
    workflow_id: &str,
    prompt: &str,
) -> String {
    format!(
        "{} ({}) opened the {} workflow room for: {}",
        provider.name,
        provider.model,
        workflow_label(workflow_id),
        prompt
    )
}

fn continue_assistant_message(
    provider: &nuka_domain::provider::ProviderConfig,
    workflow_id: &str,
    prompt: &str,
) -> String {
    format!(
        "{} ({}) drafted the next {} workflow step for: {}",
        provider.name,
        provider.model,
        workflow_label(workflow_id),
        prompt
    )
}

fn initial_prompt(
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

fn workflow_label(workflow_id: &str) -> &str {
    match workflow_id {
        "workflow-release-notes" => "release notes",
        "workflow-customer-triage" => "customer triage",
        "workflow-research-brief" => "research brief",
        _ => "saved",
    }
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn starting_saved_workflow_creates_fresh_session() {
        let runtime = crate::workflow::WorkflowRuntime::new_for_test();
        let first = runtime.start_session("workflow-1").await.unwrap();
        let second = runtime.start_session("workflow-1").await.unwrap();
        assert_ne!(first.id, second.id);
    }

    #[tokio::test]
    async fn workflow_runtime_keeps_supplied_inputs() {
        let runtime = crate::workflow::WorkflowRuntime::new_for_test();
        let mut inputs = std::collections::BTreeMap::new();
        inputs.insert("goal".to_string(), "ship task five".to_string());

        let session = runtime
            .start_session_with_inputs("workflow-1", inputs.clone())
            .await
            .unwrap();

        assert_eq!(session.inputs, inputs);
    }

    #[tokio::test]
    async fn workflow_runtime_seeds_transcript_and_timeline_events() {
        let runtime = crate::workflow::WorkflowRuntime::new_for_test();
        let mut inputs = std::collections::BTreeMap::new();
        inputs.insert("goal".to_string(), "draft the release brief".to_string());

        let session = runtime
            .start_session_with_inputs("workflow-1", inputs)
            .await
            .unwrap();

        assert_eq!(session.status, "active");
        assert!(matches!(
            &session.events[0],
            crate::workflow::WorkflowEvent::UserMessage { content, .. }
                if content == "draft the release brief"
        ));
        assert!(matches!(
            session.events[1],
            crate::workflow::WorkflowEvent::AssistantMessage { .. }
        ));
        assert!(matches!(
            session.events[2],
            crate::workflow::WorkflowEvent::NodeEvent { .. }
        ));
    }

    #[tokio::test]
    async fn workflow_runtime_continues_existing_session() {
        let runtime = crate::workflow::WorkflowRuntime::new_for_test();
        let session = runtime.start_session("workflow-1").await.unwrap();

        let continued = runtime
            .continue_session(&session.id, "turn this into a handoff note")
            .await
            .unwrap();

        assert_eq!(continued.id, session.id);
        assert!(continued.events.iter().any(|event| matches!(
            event,
            crate::workflow::WorkflowEvent::UserMessage { content, .. }
                if content == "turn this into a handoff note"
        )));
    }

    #[tokio::test]
    async fn workflow_continue_persists_provider_backed_assistant_output() {
        let runtime = crate::workflow::WorkflowRuntime::new_for_test_with_provider();
        let session = runtime.start_session("workflow-release-notes").await.unwrap();

        let continued = runtime
            .continue_session(&session.id, "turn this into a handoff")
            .await
            .unwrap();

        assert!(continued.events.iter().any(|event| matches!(
            event,
            crate::workflow::WorkflowEvent::AssistantMessage { content, .. }
                if content.contains("handoff")
        )));
    }

    #[tokio::test]
    async fn workflow_runtime_keeps_chat_handoff_origin() {
        let runtime = crate::workflow::WorkflowRuntime::new_for_test();
        let session = runtime
            .start_session_with_inputs_and_origin(
                "workflow-release",
                std::collections::BTreeMap::from([(
                    "releaseScope".to_string(),
                    "Review the release checklist".to_string(),
                )]),
                Some(crate::workflow::WorkflowOrigin {
                    source_session_id: "chat-session-42".to_string(),
                    source_mode: crate::workflow::WorkflowSourceMode::SpecificWorkflow,
                }),
            )
            .await
            .unwrap();

        assert!(matches!(
            session.origin,
            Some(crate::workflow::WorkflowOrigin {
                source_session_id,
                source_mode: crate::workflow::WorkflowSourceMode::SpecificWorkflow,
            }) if source_session_id == "chat-session-42"
        ));
        assert!(matches!(
            &session.events[0],
            crate::workflow::WorkflowEvent::UserMessage { content, .. }
                if content == "Review the release checklist"
        ));
    }
}
