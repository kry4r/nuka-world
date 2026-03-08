#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentPreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub provider_id: Option<String>,
    pub knowledge_collection_ids: Vec<String>,
    pub memory_scope_ids: Vec<String>,
    pub tool_bindings: Vec<crate::tool::AgentToolBinding>,
}
