#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentToolBinding {
    pub tool_id: String,
    pub allowed: bool,
}
