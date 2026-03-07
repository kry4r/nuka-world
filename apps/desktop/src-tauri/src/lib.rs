mod app_state;
mod commands;
mod settings;
mod tray;

pub fn run() {
    tauri::Builder::default()
        .manage(app_state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::app::close_policy_minimizes_to_tray,
            commands::chat::route_world_prompt,
        ])
        .on_window_event(|window, event| {
            crate::tray::handle_window_event(window, event);
        })
        .setup(|app| {
            crate::tray::install(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}

#[cfg(test)]
mod tests {
    #[test]
    fn desktop_workspace_bootstrap_placeholder() {
        assert!(std::path::Path::new("../package.json").exists());
    }
}
