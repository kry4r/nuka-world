use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRouteResponse {
    pub session_id: String,
    pub route: ChatRoute,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ChatRoute {
    DirectReply,
    ExistingWorkflow { #[serde(rename = "workflowId")] workflow_id: String },
    NewWorkflow,
}

#[tauri::command]
pub async fn route_world_prompt(
    prompt: String,
    session_id: Option<String>,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<ChatRouteResponse, String> {
    let turn = match session_id {
        Some(session_id) => state
            .world_runtime()
            .continue_session(&session_id, &prompt)
            .await,
        None => state.world_runtime().start_session(&prompt).await,
    }
    .map_err(|error| error.to_string())?;

    let route = match turn.route {
        nuka_runtime::world::WorldRoute::DirectReply => ChatRoute::DirectReply,
        nuka_runtime::world::WorldRoute::ExistingWorkflow(workflow_id) => {
            ChatRoute::ExistingWorkflow { workflow_id }
        }
        nuka_runtime::world::WorldRoute::NewWorkflow => ChatRoute::NewWorkflow,
    };

    Ok(ChatRouteResponse {
        session_id: turn.session.id,
        route,
    })
}
