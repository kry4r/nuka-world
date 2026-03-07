#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentToolBinding {
    pub tool_id: String,
    pub allowed: bool,
}

impl AgentToolBinding {
    pub fn allowed(tool_id: impl Into<String>) -> Self {
        Self {
            tool_id: tool_id.into(),
            allowed: true,
        }
    }
}
