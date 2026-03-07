use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegratedToolPolicyResponse {
    pub tool_name: String,
    pub target_scope: String,
}

#[tauri::command]
pub fn integrated_tool_output_policy(tool_name: String) -> IntegratedToolPolicyResponse {
    let policy = match tool_name.as_str() {
        "claude_code" => nuka_tools::claude_code::ClaudeCodeSession::default_policy(),
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
