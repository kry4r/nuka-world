pub mod agents;
pub mod chat_service;
pub mod knowledge_service;
pub mod memory_service;
pub mod providers;
pub mod session;
pub mod settings_service;
pub mod workflow;
pub mod workflow_world;
pub mod world;

#[cfg(test)]
mod tests {
    use crate::{
        agents::AgentsService,
        chat_service::ChatService,
        knowledge_service::KnowledgeService,
        memory_service::MemoryService,
        providers::ProvidersService,
        settings_service::SettingsService,
    };
    use nuka_domain::{
        agent::AgentPreset,
        knowledge::{KnowledgeCollection, KnowledgeConnector, KnowledgeConnectorKind},
        memory::MemoryScope,
        provider::{ProviderConfig, ProviderKind},
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
        }
    }

    #[tokio::test]
    async fn chat_service_requires_default_provider_before_sending() {
        let service = ChatService::new_for_test_without_provider();
        let result = service.send_message("hello", None).await;
        assert!(result.is_err());
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
        let service = ProvidersService::new_for_test();
        service.save_provider(sample_provider()).await.unwrap();
        service.set_default_provider("provider-local").await.unwrap();

        let provider = service.resolve_default_provider().await.unwrap();
        assert_eq!(provider.model, "gpt-oss");
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
                knowledge_collection_ids: vec!["knowledge-rust".to_string()],
                memory_scope_ids: vec!["memory-review".to_string()],
                tool_bindings: vec![AgentToolBinding::allowed("codex")],
            })
            .await
            .unwrap();

        let items = service.list_agents().await.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].tool_bindings, vec![AgentToolBinding::allowed("codex")]);
    }

    #[tokio::test]
    async fn knowledge_service_reports_engine_health() {
        let service = KnowledgeService::new_for_test_missing_engine();
        assert!(matches!(service.health().await, EngineHealth::Unavailable { .. }));
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
}
