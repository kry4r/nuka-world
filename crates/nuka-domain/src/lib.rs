pub mod agent;
pub mod chat;
pub mod knowledge;
pub mod memory;
pub mod provider;
pub mod tool;
pub mod workflow;

#[cfg(test)]
mod tests {
    use crate::provider::ProviderConfig;
    use crate::workflow::{WorkflowTemplate, WorkflowVisibility};

    #[test]
    fn openai_compatible_provider_requires_base_url_and_model() {
        let provider = ProviderConfig::openai_compatible("Local", "", "", "");
        assert!(provider.validate().is_err());
    }

    #[test]
    fn openai_compatible_provider_allows_empty_token_for_local_backends() {
        let provider = ProviderConfig::openai_compatible(
            "Local",
            "http://localhost:11434/v1",
            "",
            "gpt-oss",
        );

        assert!(provider.validate().is_ok());
    }

    #[test]
    fn saved_workflow_defaults_to_private_visibility() {
        let workflow = WorkflowTemplate::saved("code-review");
        assert_eq!(workflow.visibility, WorkflowVisibility::Private);
        assert!(workflow.inputs.is_empty());
    }
}
