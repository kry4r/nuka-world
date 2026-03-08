mod app_state;
mod bootstrap;
mod commands;
mod settings;
mod tray;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::agents::default_agent_tool_bindings,
            commands::agents::delete_agent,
            commands::agents::generate_agent_draft,
            commands::agents::list_agents,
            commands::agents::save_agent,
            commands::app::close_policy_minimizes_to_tray,
            commands::chat::route_world_prompt,
            commands::knowledge::add_folder_connector,
            commands::knowledge::default_knowledge_library,
            commands::knowledge::list_index_jobs,
            commands::knowledge::list_knowledge_libraries,
            commands::knowledge::rebuild_knowledge_library,
            commands::knowledge::search_knowledge,
            commands::memory::memory_promotion_policy,
            commands::providers::delete_provider,
            commands::providers::list_providers,
            commands::providers::provider_registry,
            commands::providers::save_provider,
            commands::providers::test_provider_connection,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::tools::integrated_tool_output_policy,
            commands::workflow::start_workflow_session,
        ])
        .on_window_event(|window, event| {
            crate::tray::handle_window_event(window, event);
        })
        .setup(|app| {
            let state = tauri::async_runtime::block_on(crate::bootstrap::build_app_state(app.handle()))
                .unwrap_or_else(|error| panic!("failed to bootstrap persistent app state: {error}"));
            app.manage(state);
            crate::tray::install(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn bootstrap_initializes_database_and_services() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        assert!(state.provider_service().list_providers().await.unwrap().is_empty());
    }

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
