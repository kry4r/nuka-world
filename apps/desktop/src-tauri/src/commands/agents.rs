use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolBindingSetResponse {
    pub names: Vec<String>,
}

#[tauri::command]
pub fn default_agent_tool_bindings() -> ToolBindingSetResponse {
    let names = nuka_tools::registry::ToolBindingSet::from_names(["codex", "git", "search_knowledge"])
        .into_vec();

    ToolBindingSetResponse { names }
}
