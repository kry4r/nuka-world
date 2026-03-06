pub mod agent;
pub mod knowledge;
pub mod memory;
pub mod tool;
pub mod workflow;

#[cfg(test)]
mod tests {
    use crate::workflow::{WorkflowTemplate, WorkflowVisibility};

    #[test]
    fn saved_workflow_defaults_to_private_visibility() {
        let workflow = WorkflowTemplate::saved("code-review");
        assert_eq!(workflow.visibility, WorkflowVisibility::Private);
    }
}
