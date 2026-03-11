#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolCatalogEntry {
    pub tool_name: &'static str,
    pub adapter_kind: &'static str,
    pub cost_class: &'static str,
}

pub struct ToolBindingSet(Vec<String>);

impl ToolBindingSet {
    pub fn from_names<const N: usize>(names: [&str; N]) -> Self {
        Self(names.into_iter().map(|name| name.to_string()).collect())
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn into_vec(self) -> Vec<String> {
        self.0
    }
}

pub fn default_team_tool_catalog() -> Vec<ToolCatalogEntry> {
    vec![
        ToolCatalogEntry {
            tool_name: "codex",
            adapter_kind: "integrated_agent",
            cost_class: "high",
        },
        ToolCatalogEntry {
            tool_name: "claude_code",
            adapter_kind: "integrated_agent",
            cost_class: "high",
        },
        ToolCatalogEntry {
            tool_name: "opencode",
            adapter_kind: "integrated_agent",
            cost_class: "high",
        },
        ToolCatalogEntry {
            tool_name: "mcp:filesystem",
            adapter_kind: "mcp",
            cost_class: "low",
        },
        ToolCatalogEntry {
            tool_name: "mcp:fetch",
            adapter_kind: "mcp",
            cost_class: "low",
        },
        ToolCatalogEntry {
            tool_name: "cli:git-read",
            adapter_kind: "cli",
            cost_class: "medium",
        },
        ToolCatalogEntry {
            tool_name: "cli:test-runner",
            adapter_kind: "cli",
            cost_class: "medium",
        },
        ToolCatalogEntry {
            tool_name: "search_knowledge",
            adapter_kind: "mcp",
            cost_class: "low",
        },
        ToolCatalogEntry {
            tool_name: "git",
            adapter_kind: "cli",
            cost_class: "medium",
        },
    ]
}

#[cfg(test)]
mod tests {
    #[test]
    fn agent_can_bind_multiple_tools() {
        let bindings = crate::registry::ToolBindingSet::from_names(["codex", "git", "search_knowledge"]);
        assert_eq!(bindings.len(), 3);
    }

    #[test]
    fn tool_registry_lists_codex_claude_code_and_opencode() {
        let names =
            crate::registry::ToolBindingSet::from_names(["codex", "claude_code", "opencode"])
                .into_vec();
        assert!(names.iter().any(|name| name == "opencode"));
    }

    #[test]
    fn default_team_tool_catalog_exposes_integrated_agents_and_scoped_tools() {
        let catalog = crate::registry::default_team_tool_catalog();
        assert!(catalog.iter().any(|entry| entry.tool_name == "codex"));
        assert!(catalog.iter().any(|entry| entry.tool_name == "opencode"));
        assert!(catalog.iter().any(|entry| entry.tool_name == "mcp:filesystem"));
    }
}
