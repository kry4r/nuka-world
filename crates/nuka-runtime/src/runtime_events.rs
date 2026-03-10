#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeEvent {
    ChatTurnCompleted {
        session_id: String,
        prompt: String,
    },
    WorkflowSessionStarted {
        session_id: String,
        workflow_id: String,
        prompt: String,
    },
    WorkflowTurnCompleted {
        session_id: String,
        workflow_id: String,
        prompt: String,
    },
}
