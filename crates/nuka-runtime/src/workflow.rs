#[derive(Debug, Clone)]
pub struct WorkflowSession {
    pub id: String,
    pub workflow_id: String,
    pub inputs: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Default, Clone)]
pub struct WorkflowRuntime;

impl WorkflowRuntime {
    pub fn new_for_test() -> Self {
        Self
    }

    pub async fn start_session(&self, workflow_id: &str) -> anyhow::Result<WorkflowSession> {
        self.start_session_with_inputs(workflow_id, std::collections::BTreeMap::new())
            .await
    }

    pub async fn start_session_with_inputs(
        &self,
        workflow_id: &str,
        inputs: std::collections::BTreeMap<String, String>,
    ) -> anyhow::Result<WorkflowSession> {
        Ok(WorkflowSession {
            id: uuid::Uuid::new_v4().to_string(),
            workflow_id: workflow_id.to_string(),
            inputs,
        })
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
}
