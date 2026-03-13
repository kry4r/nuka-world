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
            .prepare_provider_for_prompt(&initial_prompt, None)
            .await?;
        let session = WorkflowSession {
            id: uuid::Uuid::new_v4().to_string(),
            workflow_id: workflow_id.to_string(),
            events: seed_events(workflow_id, &initial_prompt, &provider.provider),
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
            .prepare_provider_for_prompt(prompt, None)
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
            content: continue_assistant_message(&provider.provider, &session.workflow_id, prompt),
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

    pub async fn explain_template(
        &self,
        workflow_id: &str,
    ) -> anyhow::Result<nuka_domain::workflow::WorkflowExplanation> {
        explain_template(workflow_id).await
    }

    pub async fn preview_template_revision(
        &self,
        workflow_id: &str,
        prompt: &str,
    ) -> anyhow::Result<nuka_domain::workflow::WorkflowRevisionPreview> {
        preview_template_revision(workflow_id, prompt).await
    }
}

pub async fn explain_template(
    workflow_id: &str,
) -> anyhow::Result<nuka_domain::workflow::WorkflowExplanation> {
    let definition = workflow_definition(workflow_id);

    Ok(nuka_domain::workflow::WorkflowExplanation {
        workflow_id: workflow_id.to_string(),
        title: definition.title.to_string(),
        summary: definition.summary.to_string(),
        steps: definition
            .steps
            .iter()
            .map(|step| nuka_domain::workflow::WorkflowExplanationStep {
                id: step.id.to_string(),
                title: step.title.to_string(),
                purpose: step.purpose.to_string(),
                executor: step.executor.to_string(),
                input_source: step.input_source.to_string(),
                output: step.output.to_string(),
                completion: step.completion.to_string(),
            })
            .collect(),
        dependencies: nuka_domain::workflow::WorkflowDependencies {
            agents: definition
                .dependencies
                .agents
                .iter()
                .map(|value| value.to_string())
                .collect(),
            tools_and_knowledge: definition
                .dependencies
                .tools_and_knowledge
                .iter()
                .map(|value| value.to_string())
                .collect(),
            required_inputs: definition
                .dependencies
                .required_inputs
                .iter()
                .map(|value| value.to_string())
                .collect(),
        },
    })
}

pub async fn preview_template_revision(
    workflow_id: &str,
    prompt: &str,
) -> anyhow::Result<nuka_domain::workflow::WorkflowRevisionPreview> {
    let prompt = prompt.trim();
    if prompt.is_empty() {
        anyhow::bail!("workflow revision prompt cannot be empty");
    }

    let explanation = explain_template(workflow_id).await?;
    let mut step_changes = Vec::new();
    let mut dependency_changes = Vec::new();
    let mut outcome_changes = Vec::new();
    let prompt_lower = prompt.to_ascii_lowercase();

    if prompt_lower.contains("knowledge") || prompt_lower.contains("search") {
        step_changes.push("Insert a knowledge scan before drafting.".to_string());
        dependency_changes
            .push("Add the project knowledge base as a required execution dependency.".to_string());
    }

    if prompt_lower.contains("review") && prompt_lower.contains("publish") {
        step_changes.push("Split drafting into separate review and publish stages.".to_string());
        outcome_changes
            .push("The workflow produces a review-ready draft before a publish step.".to_string());
    }

    if prompt_lower.contains("confirm") || prompt_lower.contains("approval") {
        step_changes.push("Reduce the number of manual approval checkpoints.".to_string());
        outcome_changes.push("The flow reaches a final draft with fewer pauses.".to_string());
    }

    if step_changes.is_empty() {
        let first_step = explanation
            .steps
            .first()
            .map(|step| step.title.as_str())
            .unwrap_or("the intake step");
        step_changes.push(format!("Adjust {first_step} to reflect: {prompt}."));
    }

    if dependency_changes.is_empty() {
        dependency_changes.push("Keep the current workflow dependencies unchanged.".to_string());
    }

    if outcome_changes.is_empty() {
        outcome_changes.push(format!(
            "The revised workflow stays aligned with the request: {prompt}."
        ));
    }

    Ok(nuka_domain::workflow::WorkflowRevisionPreview {
        workflow_id: workflow_id.to_string(),
        prompt: prompt.to_string(),
        change_summary: format!(
            "Preview an updated {} workflow with {} planned change(s).",
            explanation.title,
            step_changes.len()
        ),
        step_changes,
        dependency_changes,
        outcome_changes,
    })
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

#[derive(Debug, Clone, Copy)]
struct WorkflowDefinition {
    title: &'static str,
    summary: &'static str,
    steps: &'static [WorkflowDefinitionStep],
    dependencies: WorkflowDefinitionDependencies,
}

#[derive(Debug, Clone, Copy)]
struct WorkflowDefinitionStep {
    id: &'static str,
    title: &'static str,
    purpose: &'static str,
    executor: &'static str,
    input_source: &'static str,
    output: &'static str,
    completion: &'static str,
}

#[derive(Debug, Clone, Copy)]
struct WorkflowDefinitionDependencies {
    agents: &'static [&'static str],
    tools_and_knowledge: &'static [&'static str],
    required_inputs: &'static [&'static str],
}

fn workflow_definition(workflow_id: &str) -> WorkflowDefinition {
    match workflow_id {
        "workflow-release-notes" => WorkflowDefinition {
            title: "Release Notes",
            summary: "Turn release scope into a draft that is ready for review and publish.",
            steps: &[
                WorkflowDefinitionStep {
                    id: "scope-intake",
                    title: "Scope intake",
                    purpose: "Collect the release scope, constraints, and target audience.",
                    executor: "Coordinator",
                    input_source: "Chat handoff or release scope input",
                    output: "A scoped release brief",
                    completion: "The brief names the release, audience, and required highlights.",
                },
                WorkflowDefinitionStep {
                    id: "draft-notes",
                    title: "Draft notes",
                    purpose: "Compose the first release notes draft from the scoped brief.",
                    executor: "Writer",
                    input_source: "Scoped release brief",
                    output: "A reviewable release notes draft",
                    completion: "The draft covers changes, fixes, and rollout notes.",
                },
                WorkflowDefinitionStep {
                    id: "final-review",
                    title: "Final review",
                    purpose: "Check tone, accuracy, and final publish readiness.",
                    executor: "Reviewer",
                    input_source: "Release notes draft",
                    output: "A publish-ready release notes package",
                    completion: "The draft is approved for publish or returned with edits.",
                },
            ],
            dependencies: WorkflowDefinitionDependencies {
                agents: &["Release writer", "Reviewer"],
                tools_and_knowledge: &["Project knowledge base", "Release checklist"],
                required_inputs: &["releaseScope"],
            },
        },
        "workflow-customer-triage" => WorkflowDefinition {
            title: "Customer Triage",
            summary: "Turn incoming customer issues into a prioritized response plan.",
            steps: &[
                WorkflowDefinitionStep {
                    id: "capture-issue",
                    title: "Capture issue",
                    purpose: "Summarize the user report and identify the affected surface.",
                    executor: "Support lead",
                    input_source: "Issue summary input",
                    output: "A normalized issue brief",
                    completion: "The issue has owner, severity, and customer impact notes.",
                },
                WorkflowDefinitionStep {
                    id: "investigate",
                    title: "Investigate",
                    purpose: "Check product history, logs, and related customer context.",
                    executor: "Investigator",
                    input_source: "Normalized issue brief",
                    output: "A likely cause and response recommendation",
                    completion: "The issue has a recommended next action and response path.",
                },
            ],
            dependencies: WorkflowDefinitionDependencies {
                agents: &["Support lead"],
                tools_and_knowledge: &["Customer history", "Knowledge base"],
                required_inputs: &["issueSummary"],
            },
        },
        _ => WorkflowDefinition {
            title: "Saved Workflow",
            summary: "Run a saved workflow through intake, drafting, and finalization.",
            steps: &[
                WorkflowDefinitionStep {
                    id: "intake",
                    title: "Intake",
                    purpose: "Gather the request and convert it into a clear working brief.",
                    executor: "Coordinator",
                    input_source: "Chat handoff or workflow inputs",
                    output: "A scoped brief",
                    completion: "The workflow has a usable brief for execution.",
                },
                WorkflowDefinitionStep {
                    id: "execute",
                    title: "Execute",
                    purpose: "Run the main drafting or analysis stage for the saved workflow.",
                    executor: "Primary agent",
                    input_source: "Scoped brief",
                    output: "A first working result",
                    completion: "The workflow produces a result the user can inspect.",
                },
                WorkflowDefinitionStep {
                    id: "finalize",
                    title: "Finalize",
                    purpose: "Package the result into the workflow's expected final shape.",
                    executor: "Reviewer",
                    input_source: "First working result",
                    output: "A final workflow output",
                    completion: "The output is ready to return to chat or apply elsewhere.",
                },
            ],
            dependencies: WorkflowDefinitionDependencies {
                agents: &["Primary agent"],
                tools_and_knowledge: &["Project knowledge base"],
                required_inputs: &["goal"],
            },
        },
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

    #[tokio::test]
    async fn workflow_runtime_returns_readable_explanation() {
        let runtime = crate::workflow::WorkflowRuntime::new_for_test();
        let explanation = runtime
            .explain_template("workflow-release-notes")
            .await
            .unwrap();

        assert_eq!(explanation.workflow_id, "workflow-release-notes");
        assert!(!explanation.steps.is_empty());
        assert!(explanation.steps[0].executor.len() > 0);
    }
}
