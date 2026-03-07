#[tauri::command]
pub async fn route_world_prompt(prompt: String) -> Result<String, String> {
    let runtime = nuka_runtime::world::WorldRuntime::new_for_test();
    let route = runtime
        .route_prompt(&prompt)
        .await
        .map_err(|error| error.to_string())?;

    let route_name = match route {
        nuka_runtime::world::WorldRoute::DirectReply => "direct_reply",
        nuka_runtime::world::WorldRoute::ExistingWorkflow(_) => "existing_workflow",
        nuka_runtime::world::WorldRoute::NewWorkflow => "new_workflow",
    };

    Ok(route_name.to_string())
}
