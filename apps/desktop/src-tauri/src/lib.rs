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
            commands::app::app_runtime_status,
            commands::app::close_policy_minimizes_to_tray,
            commands::chat::route_world_prompt,
            commands::knowledge::add_folder_connector,
            commands::knowledge::default_knowledge_library,
            commands::knowledge::list_index_jobs,
            commands::knowledge::list_knowledge_libraries,
            commands::knowledge::rebuild_knowledge_library,
            commands::knowledge::search_knowledge,
            commands::memory::create_memory_edge,
            commands::memory::delete_memory_edge,
            commands::memory::delete_memory_node,
            commands::memory::get_memory_node_detail,
            commands::memory::list_memory_by_workflow,
            commands::memory::list_memory_scopes,
            commands::memory::list_pending_memory_candidates,
            commands::memory::load_memory_graph,
            commands::memory::memory_promotion_policy,
            commands::memory::review_memory_candidate,
            commands::memory::update_memory_node,
            commands::providers::delete_provider,
            commands::providers::list_providers,
            commands::providers::provider_registry,
            commands::providers::save_provider,
            commands::providers::test_provider_connection,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::tools::integrated_tool_output_policy,
            commands::workflow::continue_workflow_session,
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

    #[test]
    fn tauri_lib_registers_memory_and_workflow_room_commands() {
        let lib_rs = std::fs::read_to_string("src/lib.rs").unwrap();
        let invoke_handler_region = lib_rs
            .split("#[cfg(test)]")
            .next()
            .expect("lib.rs should contain a non-test region");

        for command in [
            "commands::memory::load_memory_graph",
            "commands::memory::update_memory_node",
            "commands::memory::delete_memory_node",
            "commands::memory::create_memory_edge",
            "commands::memory::delete_memory_edge",
            "commands::memory::list_pending_memory_candidates",
            "commands::memory::review_memory_candidate",
            "commands::workflow::continue_workflow_session",
        ] {
            assert!(
                invoke_handler_region.contains(command),
                "missing invoke handler registration for {command}"
            );
        }
    }
}
