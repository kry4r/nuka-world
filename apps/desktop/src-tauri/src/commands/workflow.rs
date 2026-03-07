use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowSessionResponse {
    pub id: String,
    pub workflow_id: String,
}

#[tauri::command]
pub async fn start_workflow_session(
    workflow_id: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<WorkflowSessionResponse, String> {
    let session = state
        .workflow_world_runtime()
        .start_saved_workflow_session(&workflow_id)
        .await
        .map_err(|error| error.to_string())?;

    Ok(WorkflowSessionResponse {
        id: session.id,
        workflow_id: session.workflow_id,
    })
}
