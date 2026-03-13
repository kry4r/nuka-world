pub mod agents;
pub mod chat;
pub mod db;
pub mod knowledge;
pub mod memory;
pub mod migrations;
pub mod providers;
pub mod runtime_state;
pub mod sessions;
pub mod settings;
pub mod team_runs;
pub mod teams;
pub mod tools;
pub mod workflows;

#[cfg(test)]
mod tests {
    use nuka_domain::{
        agent::{AgentArchetype, AgentPreset},
        chat::{ChatMessage, ChatMessageRole, ChatSessionSummary},
        knowledge::{KnowledgeCollection, KnowledgeConnector, KnowledgeConnectorKind},
        memory::MemoryScope,
        provider::{ProviderConfig, ProviderKind},
        team::{
            RunCharter, Team, TeamAgent, TeamAgentAssignment, TeamRun, TeamRunAgent,
            TeamRunAgentStatus, TeamRunEvent, TeamRunStatus, TeamStatus,
        },
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
            secret_ref: None,
            secret_present: false,
            secret_updated_at: None,
        }
    }

    fn sample_agent() -> AgentPreset {
        AgentPreset {
            id: "agent-reviewer".to_string(),
            name: "Reviewer".to_string(),
            description: "Checks plans and code".to_string(),
            system_prompt: "Review changes carefully.".to_string(),
            provider_id: Some("provider-local".to_string()),
            archetype: AgentArchetype {
                id: "archetype-research".to_string(),
                title: "Research Analyst".to_string(),
                family: "research_and_analysis".to_string(),
                domain_focus: "Research synthesis".to_string(),
                objective_pattern: "Investigate, compare, and summarize".to_string(),
                communication_style: "Calm and evidence-first".to_string(),
                default_tool_posture: "Use search and synthesis tools sparingly".to_string(),
                memory_posture: "Keep durable findings and discard transient chatter".to_string(),
                escalation_posture: "Escalate when evidence conflicts".to_string(),
                safety_posture: "Avoid unsupported claims".to_string(),
                output_contract: "Return a concise findings brief".to_string(),
            },
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

    fn sample_team() -> Team {
        Team {
            id: "team-release".to_string(),
            name: "Release Team".to_string(),
            goal: "Ship the release cleanly".to_string(),
            summary: "Coordinates release readiness and notes.".to_string(),
            prompt_constraints: "Stay concise.".to_string(),
            permission_policy: "No destructive tools.".to_string(),
            success_criteria: "Release ships without regressions.".to_string(),
            coordination_policy: "Coordinator runs bounded review rounds.".to_string(),
            created_at: "2026-03-11T00:00:00Z".to_string(),
            updated_at: "2026-03-11T00:00:00Z".to_string(),
            status: TeamStatus::Ready,
            agents: vec![
                TeamAgent {
                    id: "team-agent-coordinator".to_string(),
                    team_id: "team-release".to_string(),
                    name: "Coordinator".to_string(),
                    role: "Coordinator".to_string(),
                    responsibility: "Drive the meeting agenda".to_string(),
                    system_prompt: "Coordinate the release team.".to_string(),
                    tool_bindings: vec![AgentToolBinding::allowed_cli(
                        "cli:git-read",
                        "Inspect repository status",
                    )],
                    tool_use_policy: Default::default(),
                    order_hint: 0,
                    created_at: "2026-03-11T00:00:00Z".to_string(),
                    updated_at: "2026-03-11T00:00:00Z".to_string(),
                },
                TeamAgent {
                    id: "team-agent-writer".to_string(),
                    team_id: "team-release".to_string(),
                    name: "Release Writer".to_string(),
                    role: "Writer".to_string(),
                    responsibility: "Draft the final release notes".to_string(),
                    system_prompt: "Write concise release notes.".to_string(),
                    tool_bindings: vec![AgentToolBinding::allowed("mcp:filesystem")],
                    tool_use_policy: Default::default(),
                    order_hint: 1,
                    created_at: "2026-03-11T00:00:00Z".to_string(),
                    updated_at: "2026-03-11T00:00:00Z".to_string(),
                },
            ],
            agent_assignments: vec![
                TeamAgentAssignment {
                    id: "assign-coordinator".to_string(),
                    team_id: "team-release".to_string(),
                    agent_id: "agent-coordinator".to_string(),
                    enabled: true,
                    order_hint: 0,
                    prompt_override: Some("Lead the round".to_string()),
                    permission_override_json: "{\"allowHighCost\":false}".to_string(),
                    created_at: "2026-03-11T00:00:00Z".to_string(),
                    updated_at: "2026-03-11T00:00:00Z".to_string(),
                },
                TeamAgentAssignment {
                    id: "assign-writer".to_string(),
                    team_id: "team-release".to_string(),
                    agent_id: "agent-writer".to_string(),
                    enabled: true,
                    order_hint: 1,
                    prompt_override: None,
                    permission_override_json: "{}".to_string(),
                    created_at: "2026-03-11T00:00:00Z".to_string(),
                    updated_at: "2026-03-11T00:00:00Z".to_string(),
                },
            ],
        }
    }

    fn sample_run() -> TeamRun {
        TeamRun {
            id: "run-release".to_string(),
            team_id: "team-release".to_string(),
            title: "Release Team Run".to_string(),
            goal: "Ship the release cleanly".to_string(),
            status: TeamRunStatus::Active,
            current_phase: "planning".to_string(),
            lead_agent_id: Some("run-agent-coordinator".to_string()),
            charter: RunCharter::default_for_goal("Ship the release cleanly"),
            created_at: "2026-03-11T00:00:00Z".to_string(),
            updated_at: "2026-03-11T00:00:00Z".to_string(),
            agents: vec![
                TeamRunAgent {
                    id: "run-agent-coordinator".to_string(),
                    run_id: "run-release".to_string(),
                    source_agent_id: Some("agent-coordinator".to_string()),
                    source_team_assignment_id: Some("assign-coordinator".to_string()),
                    source_team_agent_id: Some("team-agent-coordinator".to_string()),
                    name: "Coordinator".to_string(),
                    role: "Coordinator".to_string(),
                    responsibility: "Drive the meeting agenda".to_string(),
                    system_prompt: "Coordinate the release team.".to_string(),
                    tool_bindings: vec![AgentToolBinding::allowed_cli(
                        "cli:git-read",
                        "Inspect repository status",
                    )],
                    tool_use_policy: Default::default(),
                    status: TeamRunAgentStatus::Thinking,
                    current_work: "Breaking down the release goal".to_string(),
                    last_tool_activity: Some("cli:git-read".to_string()),
                    joined_at: "2026-03-11T00:00:00Z".to_string(),
                },
                TeamRunAgent {
                    id: "run-agent-writer".to_string(),
                    run_id: "run-release".to_string(),
                    source_agent_id: Some("agent-writer".to_string()),
                    source_team_assignment_id: Some("assign-writer".to_string()),
                    source_team_agent_id: Some("team-agent-writer".to_string()),
                    name: "Release Writer".to_string(),
                    role: "Writer".to_string(),
                    responsibility: "Draft the final release notes".to_string(),
                    system_prompt: "Write concise release notes.".to_string(),
                    tool_bindings: vec![AgentToolBinding::allowed("mcp:filesystem")],
                    tool_use_policy: Default::default(),
                    status: TeamRunAgentStatus::Waiting,
                    current_work: "Waiting for coordinator".to_string(),
                    last_tool_activity: None,
                    joined_at: "2026-03-11T00:00:00Z".to_string(),
                },
            ],
            events: vec![TeamRunEvent {
                id: "event-checkpoint".to_string(),
                run_id: "run-release".to_string(),
                kind: "checkpoint_summary".to_string(),
                agent_id: Some("run-agent-coordinator".to_string()),
                title: "Round 1 checkpoint".to_string(),
                content: "Coordinator summarized the first round.".to_string(),
                status: Some("active".to_string()),
                tool_name: Some("cli:git-read".to_string()),
                tool_call_id: Some("tool-call-1".to_string()),
                tool_target: Some("repo".to_string()),
                sequence: 1,
                created_at: "2026-03-11T00:00:00Z".to_string(),
            }],
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
    async fn saves_provider_secret_metadata_without_plaintext_token() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = crate::providers::ProviderRepository::new(db.clone());
        repo.upsert(ProviderConfig {
            id: "provider-live".to_string(),
            name: "Live".to_string(),
            kind: ProviderKind::OpenAiCompatible,
            base_url: "https://api.example.com/v1".to_string(),
            token: String::new(),
            model: "MiniMax-M2.5".to_string(),
            enabled: true,
            secret_ref: Some("provider:provider-live".to_string()),
            secret_present: true,
            secret_updated_at: Some("2026-03-12T00:00:00Z".to_string()),
        })
        .await
        .unwrap();

        let providers = repo.list().await.unwrap();
        assert_eq!(providers[0].token, "");
        assert_eq!(
            providers[0].secret_ref.as_deref(),
            Some("provider:provider-live")
        );
        assert!(providers[0].secret_present);

        let token: String =
            sqlx::query_scalar("select token from providers where id = 'provider-live'")
                .fetch_one(&db)
                .await
                .unwrap();
        assert_eq!(token, "");
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
        assert_eq!(
            items[0].tool_bindings,
            vec![AgentToolBinding::allowed("codex")]
        );
        assert_eq!(
            items[0].knowledge_collection_ids,
            vec!["knowledge-rust".to_string()]
        );
        assert_eq!(items[0].archetype.family, "research_and_analysis");
        assert_eq!(
            items[0].archetype.output_contract,
            "Return a concise findings brief"
        );
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
    async fn chat_repository_surfaces_compaction_artifacts_before_recent_messages() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = crate::chat::ChatRepository::new(db.clone());
        repo.create_session(ChatSessionSummary {
            id: "session-review".to_string(),
            title: "Review task".to_string(),
            provider_id: Some("provider-local".to_string()),
            workflow_id: None,
            message_count: 0,
        })
        .await
        .unwrap();

        for (id, role, content) in [
            ("message-1", ChatMessageRole::User, "Need a release summary"),
            ("message-2", ChatMessageRole::Assistant, "First draft"),
            ("message-3", ChatMessageRole::User, "Add risks"),
            ("message-4", ChatMessageRole::Assistant, "Updated draft"),
        ] {
            repo.append_message(ChatMessage {
                id: id.to_string(),
                session_id: "session-review".to_string(),
                role,
                content: content.to_string(),
            })
            .await
            .unwrap();
        }

        repo.compact_messages(
            "session-review",
            &["message-1".to_string(), "message-2".to_string()],
            "Compacted earlier turns into one summary",
        )
        .await
        .unwrap();

        let messages = repo.list_messages("session-review").await.unwrap();
        let compactions = repo.list_compactions("session-review").await.unwrap();

        assert_eq!(compactions.len(), 1);
        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0].role, ChatMessageRole::System);
        assert!(messages[0]
            .content
            .contains("Compacted earlier turns into one summary"));
        assert_eq!(messages[1].id, "message-3");
    }

    #[tokio::test]
    async fn saves_and_reads_runtime_state_and_memory_scopes() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let runtime_repo = crate::runtime_state::RuntimeStateRepository::new(db.clone());
        runtime_repo.put("knowledge-engine", "ready").await.unwrap();

        let memory_repo = crate::memory::MemoryScopeRepository::new(db.clone());
        memory_repo.upsert(sample_scope()).await.unwrap();

        let runtime_value = runtime_repo.get("knowledge-engine").await.unwrap();
        let scopes = memory_repo.list().await.unwrap();

        assert_eq!(runtime_value.as_deref(), Some("ready"));
        assert!(scopes.iter().any(|scope| {
            scope.id == "memory-review" && scope.workflow_id.as_deref() == Some("workflow-review")
        }));
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

    #[tokio::test]
    async fn saves_and_reads_team_definitions_and_agents() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = crate::teams::TeamRepository::new(db.clone());
        repo.save_team(sample_team()).await.unwrap();

        let teams = repo.list_teams().await.unwrap();
        assert_eq!(teams.len(), 1);
        assert_eq!(teams[0].agents.len(), 2);
        assert_eq!(teams[0].agent_assignments.len(), 2);
    }

    #[tokio::test]
    async fn team_repository_persists_agent_assignments_and_team_constraints() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let team = nuka_domain::team::Team {
            id: "team-release".to_string(),
            name: "Release Team".to_string(),
            goal: "Ship the release".to_string(),
            summary: "Coordinates release readiness".to_string(),
            prompt_constraints: "Stay concise".to_string(),
            permission_policy: "No high-cost tools without approval".to_string(),
            created_at: String::new(),
            updated_at: String::new(),
            status: nuka_domain::team::TeamStatus::Ready,
            success_criteria: String::new(),
            coordination_policy: String::new(),
            agents: Vec::new(),
            agent_assignments: vec![nuka_domain::team::TeamAgentAssignment {
                id: "assign-coordinator".to_string(),
                team_id: "team-release".to_string(),
                agent_id: "agent-coordinator".to_string(),
                enabled: true,
                order_hint: 0,
                prompt_override: Some("Lead the round".to_string()),
                permission_override_json: "{\"allowHighCost\":false}".to_string(),
                created_at: String::new(),
                updated_at: String::new(),
            }],
        };

        crate::teams::TeamRepository::new(db.clone())
            .save_team(team)
            .await
            .unwrap();
        let loaded = crate::teams::TeamRepository::new(db.clone())
            .load_team("team-release")
            .await
            .unwrap()
            .unwrap();

        assert_eq!(loaded.agent_assignments.len(), 1);
        assert_eq!(loaded.agent_assignments[0].agent_id, "agent-coordinator");
    }

    #[tokio::test]
    async fn saves_and_reads_team_run_snapshot_and_events() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = crate::team_runs::TeamRunRepository::new(db.clone());
        repo.create_run(sample_run()).await.unwrap();

        let loaded = repo.load_run("run-release").await.unwrap().unwrap();
        assert_eq!(loaded.agents.len(), 2);
        assert!(!loaded.events.is_empty());
    }

    #[tokio::test]
    async fn team_run_repository_surfaces_compaction_artifacts_before_recent_events() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let mut run = sample_run();
        run.events = vec![
            TeamRunEvent {
                id: "event-1".to_string(),
                run_id: "run-release".to_string(),
                kind: "round_agenda".to_string(),
                agent_id: Some("run-agent-coordinator".to_string()),
                title: "Agenda".to_string(),
                content: "Plan the release".to_string(),
                status: Some("completed".to_string()),
                tool_name: None,
                tool_call_id: None,
                tool_target: None,
                sequence: 1,
                created_at: "2026-03-11T00:00:00Z".to_string(),
            },
            TeamRunEvent {
                id: "event-2".to_string(),
                run_id: "run-release".to_string(),
                kind: "position_card".to_string(),
                agent_id: Some("run-agent-coordinator".to_string()),
                title: "Coordinator position".to_string(),
                content: "Ship after final review".to_string(),
                status: Some("completed".to_string()),
                tool_name: None,
                tool_call_id: None,
                tool_target: None,
                sequence: 2,
                created_at: "2026-03-11T00:01:00Z".to_string(),
            },
            TeamRunEvent {
                id: "event-3".to_string(),
                run_id: "run-release".to_string(),
                kind: "checkpoint_summary".to_string(),
                agent_id: Some("run-agent-coordinator".to_string()),
                title: "Checkpoint".to_string(),
                content: "Ready for final edits".to_string(),
                status: Some("completed".to_string()),
                tool_name: None,
                tool_call_id: None,
                tool_target: None,
                sequence: 3,
                created_at: "2026-03-11T00:02:00Z".to_string(),
            },
        ];

        let repo = crate::team_runs::TeamRunRepository::new(db.clone());
        repo.create_run(run).await.unwrap();
        repo.compact_events(
            "run-release",
            &["event-1".to_string(), "event-2".to_string()],
            2,
            "Compacted earlier run checkpoints",
        )
        .await
        .unwrap();

        let loaded = repo.load_run("run-release").await.unwrap().unwrap();
        let compactions = repo.list_compactions("run-release").await.unwrap();

        assert_eq!(compactions.len(), 1);
        assert_eq!(loaded.events[0].kind, "compaction_summary");
        assert!(loaded.events[0]
            .content
            .contains("Compacted earlier run checkpoints"));
        assert_eq!(loaded.events[1].id, "event-3");
    }
}
