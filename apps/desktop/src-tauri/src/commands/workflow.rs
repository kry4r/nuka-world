use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowSessionResponse {
    pub session_id: String,
    pub workflow_id: String,
    pub inputs: std::collections::BTreeMap<String, String>,
    pub status: String,
}

#[tauri::command]
pub async fn start_workflow_session(
    workflow_id: String,
    inputs: Option<std::collections::BTreeMap<String, String>>,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<WorkflowSessionResponse, String> {
    start_workflow_session_inner(workflow_id, inputs, &state)
        .await
        .map_err(|error| error.to_string())
}

async fn start_workflow_session_inner(
    workflow_id: String,
    inputs: Option<std::collections::BTreeMap<String, String>>,
    state: &crate::app_state::AppState,
) -> anyhow::Result<WorkflowSessionResponse> {
    let inputs = inputs.unwrap_or_default();
    let session = state
        .workflow_world_runtime()
        .start_saved_workflow_session_with_inputs(&workflow_id, inputs.clone())
        .await?;

    Ok(WorkflowSessionResponse {
        session_id: session.id,
        workflow_id: session.workflow_id,
        inputs: session.inputs,
        status: "ready".to_string(),
    })
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn start_workflow_session_returns_input_aware_execution_state() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let mut inputs = std::collections::BTreeMap::new();
        inputs.insert("goal".to_string(), "ship task eight".to_string());

        let session = super::start_workflow_session_inner(
            "workflow-release".to_string(),
            Some(inputs.clone()),
            &state,
        )
        .await
        .unwrap();

        assert_eq!(session.workflow_id, "workflow-release");
        assert_eq!(session.inputs, inputs);
        assert_eq!(session.status, "ready");
    }
}
