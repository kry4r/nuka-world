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
            commands::workflow::start_workflow_session,
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

    #[test]
    fn workspace_declares_future_runtime_crates() {
        let manifest = std::fs::read_to_string("../../../Cargo.toml").unwrap();

        for member in [
            "crates/nuka-tools",
            "crates/nuka-integrations",
            "crates/nuka-memory",
            "crates/nuka-knowledge",
        ] {
            assert!(manifest.contains(member), "missing workspace member: {member}");
        }
    }
}
