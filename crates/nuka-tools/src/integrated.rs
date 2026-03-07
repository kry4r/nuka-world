#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OutputScope {
    SessionArtifacts,
    WorkflowMemory,
    KnowledgeBase,
}

#[derive(Debug, Clone)]
pub struct OutputPolicy {
    pub target_scope: OutputScope,
}

impl Default for OutputPolicy {
    fn default() -> Self {
        Self {
            target_scope: OutputScope::SessionArtifacts,
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn integrated_tool_output_defaults_to_session_scope() {
        let policy = crate::integrated::OutputPolicy::default();
        assert_eq!(policy.target_scope, crate::integrated::OutputScope::SessionArtifacts);
    }
}
