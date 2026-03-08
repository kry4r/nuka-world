pub mod agents;
pub mod chat;
pub mod db;
pub mod memory;
pub mod migrations;
pub mod providers;
pub mod runtime_state;
pub mod sessions;
pub mod settings;
pub mod tools;
pub mod workflows;
pub mod knowledge;

#[cfg(test)]
mod tests {
    use nuka_domain::{
        agent::AgentPreset,
        chat::{ChatMessage, ChatMessageRole, ChatSessionSummary},
        knowledge::{KnowledgeCollection, KnowledgeConnector, KnowledgeConnectorKind},
        memory::MemoryScope,
        provider::{ProviderConfig, ProviderKind},
        tool::AgentToolBinding,
        workflow::WorkflowVisibility,
    };

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

    fn sample_agent() -> AgentPreset {
        AgentPreset {
            id: "agent-reviewer".to_string(),
            name: "Reviewer".to_string(),
            description: "Checks plans and code".to_string(),
            system_prompt: "Review changes carefully.".to_string(),
            provider_id: Some("provider-local".to_string()),
            knowledge_collection_ids: vec!["knowledge-rust".to_string()],
            memory_scope_ids: vec!["memory-review".to_string()],
            tool_bindings: vec![AgentToolBinding::allowed("codex")],
        }
    }

    fn sample_collection() -> KnowledgeCollection {
        KnowledgeCollection {
            id: "knowledge-rust".to_string(),
            name: "Rust Docs".to_string(),
            description: "Local project notes".to_string(),
            engine: "page-index".to_string(),
            connectors: vec![KnowledgeConnector {
                id: "connector-rust".to_string(),
                kind: KnowledgeConnectorKind::LocalFolder {
                    path: "C:/docs/rust".to_string(),
                },
                enabled: true,
            }],
            supported_extensions: vec!["md".to_string(), "rs".to_string()],
        }
    }

    fn sample_scope() -> MemoryScope {
        MemoryScope {
            id: "memory-review".to_string(),
            name: "Review Memory".to_string(),
            workflow_id: Some("workflow-review".to_string()),
            session_id: Some("session-review".to_string()),
            agent_id: Some("agent-reviewer".to_string()),
        }
    }

    #[tokio::test]
    async fn saves_and_reads_provider_configuration() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = crate::providers::ProviderRepository::new(db.clone());
        repo.upsert(sample_provider()).await.unwrap();

        let items = repo.list().await.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "Local");
        assert_eq!(items[0].model, "gpt-oss");
    }

    #[tokio::test]
    async fn saves_and_reads_settings_configuration() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = crate::settings::SettingsRepository::new(db.clone());
        let defaults = repo.load().await.unwrap();
        assert_eq!(defaults.appearance_theme, "system");
        assert!(defaults.close_to_tray);

        let updated = crate::settings::DesktopSettings {
            default_provider_id: Some("provider-local".to_string()),
            active_workflow_id: Some("workflow-review".to_string()),
            appearance_theme: "midnight".to_string(),
            close_to_tray: false,
        };

        repo.save(&updated).await.unwrap();

        let loaded = repo.load().await.unwrap();
        assert_eq!(loaded, updated);
    }

    #[tokio::test]
    async fn saves_and_reads_agent_configuration() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = crate::agents::AgentRepository::new(db.clone());
        repo.upsert(sample_agent()).await.unwrap();

        let items = repo.list().await.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].tool_bindings, vec![AgentToolBinding::allowed("codex")]);
        assert_eq!(items[0].knowledge_collection_ids, vec!["knowledge-rust".to_string()]);
    }

    #[tokio::test]
    async fn saves_and_reads_knowledge_collections() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = crate::knowledge::KnowledgeRepository::new(db.clone());
        repo.upsert_collection(sample_collection()).await.unwrap();
        repo.record_index_job(crate::knowledge::KnowledgeIndexJobRecord {
            id: "job-rust".to_string(),
            collection_id: "knowledge-rust".to_string(),
            status: "ready".to_string(),
            detail: Some("indexed 12 files".to_string()),
        })
        .await
        .unwrap();

        let items = repo.list_collections().await.unwrap();
        let jobs = repo.list_index_jobs("knowledge-rust").await.unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].connectors.len(), 1);
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].status, "ready");
    }

    #[tokio::test]
    async fn saves_and_reads_chat_sessions_and_messages() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = crate::chat::ChatRepository::new(db.clone());
        repo.create_session(ChatSessionSummary {
            id: "session-review".to_string(),
            title: "Review task".to_string(),
            provider_id: Some("provider-local".to_string()),
            workflow_id: Some("workflow-review".to_string()),
            message_count: 0,
        })
        .await
        .unwrap();
        repo.append_message(ChatMessage {
            id: "message-1".to_string(),
            session_id: "session-review".to_string(),
            role: ChatMessageRole::User,
            content: "Summarize the issue".to_string(),
        })
        .await
        .unwrap();

        let sessions = repo.list_sessions().await.unwrap();
        let messages = repo.list_messages("session-review").await.unwrap();

        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].message_count, 1);
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].role, ChatMessageRole::User);
    }

    #[tokio::test]
    async fn saves_and_reads_runtime_state_and_memory_scopes() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let runtime_repo = crate::runtime_state::RuntimeStateRepository::new(db.clone());
        runtime_repo
            .put("knowledge-engine", "ready")
            .await
            .unwrap();

        let memory_repo = crate::memory::MemoryScopeRepository::new(db.clone());
        memory_repo.upsert(sample_scope()).await.unwrap();

        let runtime_value = runtime_repo.get("knowledge-engine").await.unwrap();
        let scopes = memory_repo.list().await.unwrap();

        assert_eq!(runtime_value.as_deref(), Some("ready"));
        assert_eq!(scopes.len(), 1);
        assert_eq!(scopes[0].workflow_id.as_deref(), Some("workflow-review"));
    }

    #[tokio::test]
    async fn creates_and_reads_workflow_template() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = crate::workflows::WorkflowRepository::new(db.clone());
        repo.insert_template("engineering-room").await.unwrap();

        let items = repo.list_templates().await.unwrap();
        assert_eq!(items.len(), 1);
        assert!(items[0].inputs.is_empty());
    }

    #[tokio::test]
    async fn reruns_migrations_and_reads_private_workflow_template() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = crate::workflows::WorkflowRepository::new(db.clone());
        repo.insert_template("engineering-room").await.unwrap();

        let items = repo.list_templates().await.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "engineering-room");
        assert_eq!(items[0].visibility, WorkflowVisibility::Private);
        assert!(items[0].inputs.is_empty());
    }
}
