#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentPreset {
    pub id: String,
    pub name: String,
    pub tool_bindings: Vec<crate::tool::AgentToolBinding>,
}
