use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegratedToolPolicyResponse {
    pub tool_name: String,
    pub target_scope: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCatalogEntryResponse {
    pub tool_name: String,
    pub adapter_kind: String,
    pub cost_class: String,
}

#[tauri::command]
pub fn integrated_tool_output_policy(tool_name: String) -> IntegratedToolPolicyResponse {
    let policy = match tool_name.as_str() {
        "claude_code" => nuka_tools::claude_code::ClaudeCodeSession::default_policy(),
        "opencode" => nuka_tools::opencode::OpenCodeSession::default_policy(),
        _ => nuka_tools::codex::CodexSession::default_policy(),
    };

    let target_scope = match policy.target_scope {
        nuka_tools::integrated::OutputScope::SessionArtifacts => "session_artifacts",
        nuka_tools::integrated::OutputScope::WorkflowMemory => "workflow_memory",
        nuka_tools::integrated::OutputScope::KnowledgeBase => "knowledge_base",
    };

    IntegratedToolPolicyResponse {
        tool_name,
        target_scope: target_scope.to_string(),
    }
}

#[tauri::command]
#[allow(dead_code)]
pub fn list_tool_registry() -> Vec<ToolCatalogEntryResponse> {
    nuka_tools::registry::default_team_tool_catalog()
        .into_iter()
        .map(|entry| ToolCatalogEntryResponse {
            tool_name: entry.tool_name.to_string(),
            adapter_kind: entry.adapter_kind.to_string(),
            cost_class: entry.cost_class.to_string(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    #[test]
    fn opencode_defaults_to_session_artifacts_scope() {
        let policy = super::integrated_tool_output_policy("opencode".to_string());
        assert_eq!(policy.target_scope, "session_artifacts");
    }

    #[test]
    fn list_tool_registry_returns_explicit_team_tool_catalog() {
        let catalog = super::list_tool_registry();
        assert!(catalog.iter().any(|entry| entry.tool_name == "codex"));
        assert!(catalog.iter().any(|entry| entry.tool_name == "opencode"));
    }
}
