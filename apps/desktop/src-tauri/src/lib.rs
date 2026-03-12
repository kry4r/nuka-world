mod app_state;
mod bootstrap;
pub mod commands;
mod provider_secrets;
mod settings;
mod tray;

use tauri::Manager;

pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            commands::agents::default_agent_tool_bindings,
            commands::agents::delete_agent,
            commands::agents::generate_agent_draft,
            commands::agents::list_agents,
            commands::agents::save_agent,
            commands::app::app_runtime_status,
            commands::app::close_policy_minimizes_to_tray,
            commands::chat::execute_prompt_json,
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
            commands::providers::clear_provider_secret,
            commands::providers::import_provider_from_env,
            commands::providers::list_providers,
            commands::providers::provider_registry,
            commands::providers::save_provider,
            commands::providers::test_provider_connection,
            commands::settings::load_settings,
            commands::settings::open_external_prompt_draft,
            commands::settings::save_settings,
            commands::tools::integrated_tool_output_policy,
            commands::tools::list_tool_registry,
            commands::team::add_team_run_agent,
            commands::team::continue_team_run,
            commands::team::create_team_from_goal,
            commands::team::delete_team,
            commands::team::list_teams,
            commands::team::load_team,
            commands::team::load_team_run,
            commands::team::start_team_run,
            commands::team::update_team,
            commands::workspace::create_workspace_session_branch,
            commands::workspace::list_workspace_sessions,
            commands::workspace::load_workspace_session,
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
    fn tauri_lib_registers_memory_commands_without_workflow_surface() {
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
        ] {
            assert!(
                invoke_handler_region.contains(command),
                "missing invoke handler registration for {command}"
            );
        }
    }

    #[test]
    fn tauri_lib_registers_workspace_branch_command() {
        let lib_rs = std::fs::read_to_string("src/lib.rs").unwrap();
        let invoke_handler_region = lib_rs
            .split("#[cfg(test)]")
            .next()
            .expect("lib.rs should contain a non-test region");

        assert!(
            invoke_handler_region.contains("commands::workspace::create_workspace_session_branch"),
            "missing invoke handler registration for workspace branch creation"
        );
    }

    #[test]
    fn tauri_lib_registers_json_prompt_execution_command() {
        let lib_rs = std::fs::read_to_string("src/lib.rs").unwrap();
        let invoke_handler_region = lib_rs
            .split("#[cfg(test)]")
            .next()
            .expect("lib.rs should contain a non-test region");

        assert!(
            invoke_handler_region.contains("commands::chat::execute_prompt_json"),
            "missing invoke handler registration for JSON prompt execution"
        );
    }

    #[test]
    fn tauri_lib_does_not_register_workflow_commands() {
        let lib_rs = std::fs::read_to_string("src/lib.rs").unwrap();
        let invoke_handler_region = lib_rs
            .split("#[cfg(test)]")
            .next()
            .expect("lib.rs should contain a non-test region");

        for command in [
            "commands::workflow::explain_workflow",
            "commands::workflow::revise_workflow",
            "commands::workflow::continue_workflow_session",
            "commands::workflow::start_workflow_session",
        ] {
            assert!(
                !invoke_handler_region.contains(command),
                "unexpected workflow command registration for {command}"
            );
        }
    }

    #[test]
    fn tauri_lib_registers_mcp_bridge_in_debug_builds() {
        let lib_rs = std::fs::read_to_string("src/lib.rs").unwrap();
        let non_test_region = lib_rs
            .split("#[cfg(test)]")
            .next()
            .expect("lib.rs should contain a non-test region");

        assert!(
            non_test_region.contains("tauri_plugin_mcp_bridge::init()"),
            "expected MCP bridge plugin registration in debug builds"
        );
    }

    #[test]
    fn desktop_tauri_manifest_declares_mcp_bridge_dependency() {
        let manifest = std::fs::read_to_string("Cargo.toml").unwrap();

        assert!(
            manifest.contains("tauri-plugin-mcp-bridge"),
            "expected tauri-plugin-mcp-bridge dependency in Cargo.toml"
        );
    }

    #[test]
    fn tauri_config_enables_global_tauri_for_mcp_bridge() {
        let config = std::fs::read_to_string("tauri.conf.json").unwrap();

        assert!(
            config.contains("\"withGlobalTauri\": true"),
            "expected withGlobalTauri enabled in tauri.conf.json"
        );
    }

    #[test]
    fn default_capability_allows_mcp_bridge() {
        let capability = std::fs::read_to_string("capabilities/default.json").unwrap();

        assert!(
            capability.contains("\"mcp-bridge:default\""),
            "expected mcp-bridge:default permission in default capability"
        );
    }

    #[test]
    fn desktop_tauri_icons_include_generated_png_assets() {
        for icon in ["icons/icon.ico", "icons/icon.png", "icons/128x128.png"] {
            assert!(
                std::path::Path::new(icon).exists(),
                "expected generated desktop icon asset at {icon}"
            );
        }

        let icon_png_size = std::fs::metadata("icons/icon.png").unwrap().len();
        let icon_ico_size = std::fs::metadata("icons/icon.ico").unwrap().len();

        assert_eq!(
            icon_png_size, 6464,
            "expected icon.png generated from the same nuka.svg brand asset as chat"
        );
        assert_eq!(
            icon_ico_size, 6247,
            "expected icon.ico generated from the same nuka.svg brand asset as chat"
        );
    }
}
