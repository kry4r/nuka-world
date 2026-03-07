#[derive(Debug, Clone)]
pub struct WorkflowSession {
    pub id: String,
    pub workflow_id: String,
}

#[derive(Debug, Default, Clone)]
pub struct WorkflowRuntime;

impl WorkflowRuntime {
    pub fn new_for_test() -> Self {
        Self
    }

    pub async fn start_session(&self, workflow_id: &str) -> anyhow::Result<WorkflowSession> {
        Ok(WorkflowSession {
            id: uuid::Uuid::new_v4().to_string(),
            workflow_id: workflow_id.to_string(),
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
}
