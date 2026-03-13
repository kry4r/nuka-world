pub mod agents;
pub mod chat_service;
pub mod knowledge_service;
pub mod memory_hooks;
pub mod memory_service;
pub mod providers;
pub mod runtime_events;
pub mod session;
pub mod settings_service;
pub mod team_run_service;
pub mod team_service;
pub mod workspace_sessions;
pub mod world;

#[cfg(test)]
mod tests {
    use crate::{
        agents::AgentsService, chat_service::ChatService, knowledge_service::KnowledgeService,
        memory_service::MemoryService, providers::ProvidersService,
        settings_service::SettingsService,
    };
    use nuka_domain::{
        agent::AgentPreset,
        knowledge::{KnowledgeCollection, KnowledgeConnector, KnowledgeConnectorKind},
        memory::MemoryScope,
        provider::{ProviderConfig, ProviderKind},
        team::{Team, TeamAgent, TeamStatus},
        tool::AgentToolBinding,
    };
    use nuka_knowledge::engine::EngineHealth;
    use nuka_storage::settings::DesktopSettings;

    fn sample_provider() -> ProviderConfig {
        ProviderConfig {
            id: "provider-local".to_string(),
            name: "Local".to_string(),
            kind: ProviderKind::OpenAiCompatible,
            base_url: "http://localhost:11434/v1".to_string(),
            token: String::new(),
            model: "gpt-oss".to_string(),
            enabled: true,
            secret_ref: None,
            secret_present: false,
            secret_updated_at: None,
        }
    }

    fn sample_team() -> Team {
        Team {
            id: "team-release".to_string(),
            name: "Release Team".to_string(),
            goal: "Ship the release cleanly".to_string(),
            summary: "Coordinates release readiness".to_string(),
            prompt_constraints: "Stay concise".to_string(),
            permission_policy: "No destructive tools.".to_string(),
            success_criteria: "Release ships without regressions.".to_string(),
            coordination_policy: "Coordinator runs bounded review rounds.".to_string(),
            created_at: String::new(),
            updated_at: String::new(),
            status: TeamStatus::Ready,
            agents: vec![
                TeamAgent {
                    id: "team-agent-coordinator".to_string(),
                    team_id: "team-release".to_string(),
                    name: "Coordinator".to_string(),
                    role: "Coordinator".to_string(),
                    responsibility: "Drive the agenda".to_string(),
                    system_prompt: "Coordinate the release team.".to_string(),
                    tool_bindings: vec![AgentToolBinding::allowed("codex")],
                    tool_use_policy: Default::default(),
                    order_hint: 0,
                    created_at: String::new(),
                    updated_at: String::new(),
                },
                TeamAgent {
                    id: "team-agent-writer".to_string(),
                    team_id: "team-release".to_string(),
                    name: "Writer".to_string(),
                    role: "Writer".to_string(),
                    responsibility: "Draft the checkpoint".to_string(),
                    system_prompt: "Draft concise release notes.".to_string(),
                    tool_bindings: vec![AgentToolBinding::allowed("filesystem")],
                    tool_use_policy: Default::default(),
                    order_hint: 1,
                    created_at: String::new(),
                    updated_at: String::new(),
                },
            ],
            agent_assignments: Vec::new(),
        }
    }

    #[tokio::test]
    async fn chat_service_requires_default_provider_before_sending() {
        let service = ChatService::new_for_test_without_provider();
        let result = service.send_message("hello", None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn chat_service_compacts_long_sessions_into_summary_context() {
        let pool = crate::settings_service::test_pool();
        let provider_service = ProvidersService::new(pool.clone());
        let service = ChatService::new_for_test_with_seeded_completion_and_provider_service(
            pool.clone(),
            provider_service.clone(),
        );

        provider_service.save_provider(sample_provider()).await.unwrap();
        provider_service
            .set_default_provider("provider-local")
            .await
            .unwrap();

        let first = service
            .send_message("Need a release summary", None)
            .await
            .unwrap();
        let session_id = first.session.id.clone();

        service
            .send_message("Add the risks and blockers", Some(&session_id))
            .await
            .unwrap();
        service
            .send_message("Finish with a final recommendation", Some(&session_id))
            .await
            .unwrap();

        let repo = nuka_storage::chat::ChatRepository::new(pool.clone());
        let messages = repo.list_messages(&session_id).await.unwrap();
        let compactions = repo.list_compactions(&session_id).await.unwrap();

        assert!(!compactions.is_empty());
        assert!(matches!(
            messages.first().map(|message| &message.role),
            Some(nuka_domain::chat::ChatMessageRole::System)
        ));
        assert!(messages
            .iter()
            .any(|message| message.content.contains("Finish with a final recommendation")));
    }

    #[tokio::test]
    async fn settings_service_round_trips_configuration() {
        let service = SettingsService::new_for_test();
        let settings = DesktopSettings {
            default_provider_id: Some("provider-local".to_string()),
            active_workflow_id: Some("workflow-review".to_string()),
            appearance_theme: "midnight".to_string(),
            close_to_tray: false,
        };

        service.save(&settings).await.unwrap();
        let loaded = service.load().await.unwrap();

        assert_eq!(loaded, settings);
    }

    #[tokio::test]
    async fn providers_service_resolves_default_provider() {
        let secret_loader: std::sync::Arc<crate::providers::ProviderSecretLoader> =
            std::sync::Arc::new(|provider_id| {
                let provider_id = provider_id.to_string();
                Box::pin(async move {
                    Ok((provider_id == "provider-local").then(|| "sk-live".to_string()))
                })
            });
        let service = ProvidersService::new_with_secret_loader(
            crate::settings_service::test_pool(),
            secret_loader,
        );
        let mut provider = sample_provider();
        provider.secret_ref = Some("provider:provider-local".to_string());
        provider.secret_present = true;
        service.save_provider(provider).await.unwrap();
        service
            .set_default_provider("provider-local")
            .await
            .unwrap();

        let provider = service.resolve_default_provider().await.unwrap();
        assert_eq!(provider.model, "gpt-oss");
        assert_eq!(provider.token, "sk-live");
    }

    #[tokio::test]
    async fn agents_service_round_trips_agents() {
        let service = AgentsService::new_for_test();
        service
            .save_agent(AgentPreset {
                id: "agent-reviewer".to_string(),
                name: "Reviewer".to_string(),
                description: "Checks plans and code".to_string(),
                system_prompt: "Review carefully.".to_string(),
                provider_id: Some("provider-local".to_string()),
                archetype: nuka_domain::agent::AgentArchetype {
                    id: "archetype-operations".to_string(),
                    title: "Operations Coordinator".to_string(),
                    family: "operations".to_string(),
                    domain_focus: "Operational follow-through".to_string(),
                    objective_pattern: "Plan, coordinate, and close loops".to_string(),
                    communication_style: "Clear and directive".to_string(),
                    default_tool_posture: "Prefer low-cost coordination tools".to_string(),
                    memory_posture: "Retain durable checkpoints".to_string(),
                    escalation_posture: "Escalate on unresolved blockers".to_string(),
                    safety_posture: "Pause before destructive actions".to_string(),
                    output_contract: "Return a checkpoint plan".to_string(),
                },
                knowledge_collection_ids: vec!["knowledge-rust".to_string()],
                memory_scope_ids: vec!["memory-review".to_string()],
                tool_bindings: vec![AgentToolBinding::allowed("codex")],
            })
            .await
            .unwrap();

        let items = service.list_agents().await.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(
            items[0].tool_bindings,
            vec![AgentToolBinding::allowed("codex")]
        );
        assert_eq!(items[0].archetype.family, "operations");
        assert_eq!(items[0].archetype.title, "Operations Coordinator");
    }

    #[tokio::test]
    async fn knowledge_service_reports_engine_health() {
        let service = KnowledgeService::new_for_test_missing_engine();
        assert!(matches!(
            service.health().await,
            EngineHealth::Unavailable { .. }
        ));
    }

    #[tokio::test]
    async fn knowledge_service_round_trips_collections() {
        let service = KnowledgeService::new_for_test_missing_engine();
        service
            .save_collection(KnowledgeCollection {
                id: "knowledge-rust".to_string(),
                name: "Rust Docs".to_string(),
                description: "Local docs".to_string(),
                engine: "page-index".to_string(),
                connectors: vec![KnowledgeConnector {
                    id: "connector-rust".to_string(),
                    kind: KnowledgeConnectorKind::LocalFolder {
                        path: "C:/docs/rust".to_string(),
                    },
                    enabled: true,
                }],
                supported_extensions: vec!["md".to_string(), "rs".to_string()],
            })
            .await
            .unwrap();

        let items = service.list_collections().await.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].engine, "page-index");
    }

    #[tokio::test]
    async fn memory_service_filters_scopes_by_workflow() {
        let service = MemoryService::new_for_test();
        service
            .save_scope(MemoryScope {
                id: "memory-review".to_string(),
                name: "Review Memory".to_string(),
                workflow_id: Some("workflow-review".to_string()),
                session_id: Some("session-review".to_string()),
                agent_id: Some("agent-reviewer".to_string()),
            })
            .await
            .unwrap();

        let scopes = service.list_by_workflow("workflow-review").await.unwrap();
        assert_eq!(scopes.len(), 1);
        assert_eq!(scopes[0].agent_id.as_deref(), Some("agent-reviewer"));
    }

    #[tokio::test]
    async fn team_run_service_compacts_long_runs_into_summary_events() {
        let pool = crate::settings_service::test_pool();
        let provider_service = ProvidersService::new(pool.clone());
        let service =
            crate::team_run_service::TeamRunService::new_for_test_with_seeded_completion_and_provider_service(
                pool.clone(),
                provider_service.clone(),
            );

        provider_service.save_provider(sample_provider()).await.unwrap();
        provider_service
            .set_default_provider("provider-local")
            .await
            .unwrap();
        nuka_storage::teams::TeamRepository::new(pool.clone())
            .save_team(sample_team())
            .await
            .unwrap();

        let run = service.start_team_run("team-release").await.unwrap();
        let run = service
            .continue_team_run(&run.id, "Add the launch checklist and risks")
            .await
            .unwrap();

        let repo = nuka_storage::team_runs::TeamRunRepository::new(pool.clone());
        let loaded = repo.load_run(&run.id).await.unwrap().unwrap();
        let compactions = repo.list_compactions(&run.id).await.unwrap();

        assert!(!compactions.is_empty());
        assert_eq!(loaded.events[0].kind, "compaction_summary");
        assert!(loaded
            .events
            .iter()
            .any(|event| event.kind == "checkpoint_summary"));
    }

    #[test]
    fn runtime_lib_does_not_export_workflow_runtime_modules() {
        let lib_rs = std::fs::read_to_string("src/lib.rs").unwrap();
        let non_test_region = lib_rs
            .split("#[cfg(test)]")
            .next()
            .expect("lib.rs should contain a non-test region");

        for module in ["pub mod workflow;", "pub mod workflow_world;"] {
            assert!(
                !non_test_region.contains(module),
                "unexpected workflow runtime export: {module}"
            );
        }
    }
}
