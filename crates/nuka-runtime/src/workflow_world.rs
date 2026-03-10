#[derive(Debug, Clone)]
pub struct WorkflowWorldRuntime {
    workflow_runtime: crate::workflow::WorkflowRuntime,
}

impl Default for WorkflowWorldRuntime {
    fn default() -> Self {
        Self::new(crate::chat_service::ChatService::new_for_test_with_default_provider())
    }
}

impl WorkflowWorldRuntime {
    pub fn new(chat_service: crate::chat_service::ChatService) -> Self {
        Self {
            workflow_runtime: crate::workflow::WorkflowRuntime::new(chat_service),
        }
    }

    pub fn new_for_test() -> Self {
        Self::default()
    }

    pub async fn start_saved_workflow_session(
        &self,
        workflow_id: &str,
    ) -> anyhow::Result<crate::workflow::WorkflowSession> {
        self.workflow_runtime.start_session(workflow_id).await
    }

    pub async fn start_saved_workflow_session_with_inputs(
        &self,
        workflow_id: &str,
        inputs: std::collections::BTreeMap<String, String>,
    ) -> anyhow::Result<crate::workflow::WorkflowSession> {
        self.start_saved_workflow_session_with_inputs_and_origin(workflow_id, inputs, None)
            .await
    }

    pub async fn start_saved_workflow_session_with_inputs_and_origin(
        &self,
        workflow_id: &str,
        inputs: std::collections::BTreeMap<String, String>,
        origin: Option<crate::workflow::WorkflowOrigin>,
    ) -> anyhow::Result<crate::workflow::WorkflowSession> {
        self.workflow_runtime
            .start_session_with_inputs_and_origin(workflow_id, inputs, origin)
            .await
    }

    pub async fn continue_saved_workflow_session(
        &self,
        session_id: &str,
        prompt: &str,
    ) -> anyhow::Result<crate::workflow::WorkflowSession> {
        self.workflow_runtime
            .continue_session(session_id, prompt)
            .await
    }
}
