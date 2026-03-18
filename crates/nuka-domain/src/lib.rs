pub mod agent;
pub mod chat;
pub mod knowledge;
pub mod memory;
pub mod provider;
pub mod team;
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
        let provider =
            ProviderConfig::openai_compatible("Local", "http://localhost:11434/v1", "", "gpt-oss");

        assert!(provider.validate().is_ok());
    }

    #[test]
    fn saved_workflow_defaults_to_private_visibility() {
        let workflow = WorkflowTemplate::saved("code-review");
        assert_eq!(workflow.visibility, WorkflowVisibility::Private);
        assert!(workflow.inputs.is_empty());
    }

    #[test]
    fn team_defaults_to_ready_with_budget_defaults() {
        let team =
            crate::team::Team::new("team-release", "Release Team", "Ship the release cleanly");
        assert_eq!(team.status, crate::team::TeamStatus::Ready);
        assert!(team.agents.is_empty());

        let charter = crate::team::RunCharter::default_for_goal("Ship the release cleanly");
        assert_eq!(charter.max_active_agents_per_round, 3);
        assert_eq!(charter.max_messages_per_agent_per_round, 2);
    }

    #[test]
    fn agent_tool_binding_carries_adapter_and_cost_metadata() {
        let binding =
            crate::tool::AgentToolBinding::allowed_cli("cli:git-read", "Inspect repo state");
        assert_eq!(binding.tool_id, "cli:git-read");
        assert_eq!(binding.adapter_kind, crate::tool::ToolAdapterKind::Cli);
        assert_eq!(binding.cost_class, crate::tool::ToolCostClass::Medium);
    }
}
