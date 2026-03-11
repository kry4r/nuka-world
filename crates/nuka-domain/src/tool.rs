#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentToolBinding {
    pub tool_id: String,
    pub allowed: bool,
    pub adapter_kind: ToolAdapterKind,
    pub purpose: String,
    pub cost_class: ToolCostClass,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IntegratedToolKind {
    Codex,
    ClaudeCode,
    OpenCode,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolAdapterKind {
    Mcp,
    Cli,
    IntegratedAgent,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolCostClass {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolUsePolicy {
    pub max_calls_per_round: Option<usize>,
    pub summarize_output: bool,
}

impl Default for ToolUsePolicy {
    fn default() -> Self {
        Self {
            max_calls_per_round: Some(1),
            summarize_output: true,
        }
    }
}

impl AgentToolBinding {
    pub fn allowed(tool_id: impl Into<String>) -> Self {
        Self {
            tool_id: tool_id.into(),
            allowed: true,
            adapter_kind: ToolAdapterKind::Mcp,
            purpose: String::new(),
            cost_class: ToolCostClass::Low,
        }
    }

    pub fn allowed_cli(tool_id: impl Into<String>, purpose: impl Into<String>) -> Self {
        Self {
            tool_id: tool_id.into(),
            allowed: true,
            adapter_kind: ToolAdapterKind::Cli,
            purpose: purpose.into(),
            cost_class: ToolCostClass::Medium,
        }
    }
}
