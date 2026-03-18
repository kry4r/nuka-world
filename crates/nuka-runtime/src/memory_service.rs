#[derive(Debug, Clone)]
pub struct MemoryService {
    pool: sqlx::SqlitePool,
}

impl MemoryService {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub fn new_for_test() -> Self {
        Self::new(crate::settings_service::test_pool())
    }

    pub async fn save_scope(&self, scope: nuka_domain::memory::MemoryScope) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::memory::MemoryScopeRepository::new(self.pool.clone())
            .upsert(scope)
            .await
    }

    pub async fn load_graph(&self) -> anyhow::Result<nuka_domain::memory::MemoryGraph> {
        self.load_graph_for_scope(None).await
    }

    pub async fn load_graph_for_scope(
        &self,
        scope_id: Option<&str>,
    ) -> anyhow::Result<nuka_domain::memory::MemoryGraph> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::memory::MemoryGraphRepository::new(self.pool.clone())
            .load_graph_for_scope(scope_id)
            .await
    }

    pub async fn upsert_node(
        &self,
        node: nuka_domain::memory::MemoryGraphNode,
    ) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        let node_id = node.id.clone();
        nuka_storage::memory::MemoryGraphRepository::new(self.pool.clone())
            .upsert_node(node)
            .await?;
        self.bind_node_to_scope(&node_id, "world").await
    }

    pub async fn update_node(
        &self,
        node_id: &str,
        title: String,
        body: Option<String>,
    ) -> anyhow::Result<Option<nuka_domain::memory::MemoryGraphNode>> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::memory::MemoryGraphRepository::new(self.pool.clone())
            .update_node(node_id, &title, body.as_deref())
            .await
    }

    pub async fn delete_node(&self, node_id: &str) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::memory::MemoryGraphRepository::new(self.pool.clone())
            .delete_node(node_id)
            .await
    }

    pub async fn create_edge(
        &self,
        edge: nuka_domain::memory::MemoryGraphEdge,
    ) -> anyhow::Result<nuka_domain::memory::MemoryGraphEdge> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::memory::MemoryGraphRepository::new(self.pool.clone())
            .create_edge(edge)
            .await
    }

    pub async fn delete_edge(&self, edge_id: &str) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::memory::MemoryGraphRepository::new(self.pool.clone())
            .delete_edge(edge_id)
            .await
    }

    pub async fn bind_node_to_scope(&self, node_id: &str, scope_id: &str) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::memory::MemoryGraphRepository::new(self.pool.clone())
            .bind_node_to_scope(node_id, scope_id)
            .await
    }

    pub async fn list_pending_candidates(
        &self,
    ) -> anyhow::Result<Vec<nuka_domain::memory::MemoryCandidate>> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::memory::MemoryCandidateRepository::new(self.pool.clone())
            .list_pending()
            .await
    }

    pub async fn list_snapshots(&self) -> anyhow::Result<Vec<nuka_domain::memory::MemorySnapshot>> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::memory::MemorySnapshotRepository::new(self.pool.clone())
            .list()
            .await
    }

    pub async fn create_candidate_for_test(
        &self,
        title: &str,
    ) -> anyhow::Result<nuka_domain::memory::MemoryCandidate> {
        self.record_runtime_candidate(
            nuka_domain::memory::MemorySurface::Workflow,
            "workflow-test",
            title,
            "Seeded memory candidate for tests",
            workflow_scope("workflow-test"),
        )
        .await
    }

    pub async fn review_candidate(
        &self,
        candidate_id: &str,
        decision: nuka_domain::memory::ReviewDecision,
    ) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;

        let candidate_repository =
            nuka_storage::memory::MemoryCandidateRepository::new(self.pool.clone());
        let graph_repository = nuka_storage::memory::MemoryGraphRepository::new(self.pool.clone());
        let snapshot_repository =
            nuka_storage::memory::MemorySnapshotRepository::new(self.pool.clone());
        let review_repository =
            nuka_storage::memory::MemoryReviewActionRepository::new(self.pool.clone());

        let candidate = candidate_repository
            .get(candidate_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("memory candidate not found: {candidate_id}"))?;
        let mut node = graph_repository
            .get_node(&candidate.node_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("memory node not found: {}", candidate.node_id))?;

        match decision {
            nuka_domain::memory::ReviewDecision::PromoteSemantic => {
                node.trace_type = nuka_domain::memory::MemoryTraceType::Semantic;
                node.consolidation_state = nuka_domain::memory::MemoryConsolidationState::Approved;
            }
            nuka_domain::memory::ReviewDecision::KeepEpisodic => {
                node.trace_type = nuka_domain::memory::MemoryTraceType::Episodic;
                node.consolidation_state = nuka_domain::memory::MemoryConsolidationState::Approved;
            }
            nuka_domain::memory::ReviewDecision::Reject => {
                node.consolidation_state = nuka_domain::memory::MemoryConsolidationState::Rejected;
            }
        }

        graph_repository.upsert_node(node.clone()).await?;
        snapshot_repository
            .create(nuka_domain::memory::MemorySnapshot {
                id: uuid::Uuid::new_v4().to_string(),
                node_id: node.id.clone(),
                title: node.title.clone(),
                body: node.body.clone(),
                trace_type: node.trace_type.clone(),
            })
            .await?;
        review_repository
            .create(nuka_domain::memory::MemoryReviewAction {
                id: uuid::Uuid::new_v4().to_string(),
                candidate_id: candidate.id.clone(),
                node_id: node.id.clone(),
                decision: decision.clone(),
            })
            .await?;
        candidate_repository
            .mark_reviewed(candidate_id, decision)
            .await?;

        Ok(())
    }

    pub async fn handle_runtime_event(
        &self,
        event: crate::runtime_events::RuntimeEvent,
    ) -> anyhow::Result<()> {
        crate::memory_hooks::handle_runtime_event(self, event).await
    }

    pub async fn list_scopes(&self) -> anyhow::Result<Vec<nuka_domain::memory::MemoryScope>> {
        self.list_all().await
    }

    pub async fn get_scope(
        &self,
        scope_id: &str,
    ) -> anyhow::Result<Option<nuka_domain::memory::MemoryScope>> {
        Ok(self
            .list_all()
            .await?
            .into_iter()
            .find(|scope| scope.id == scope_id))
    }

    pub async fn list_by_workflow(
        &self,
        workflow_id: &str,
    ) -> anyhow::Result<Vec<nuka_domain::memory::MemoryScope>> {
        let items = self.list_all().await?;
        Ok(items
            .into_iter()
            .filter(|scope| scope.workflow_id.as_deref() == Some(workflow_id))
            .collect())
    }

    pub async fn list_by_session(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Vec<nuka_domain::memory::MemoryScope>> {
        let items = self.list_all().await?;
        Ok(items
            .into_iter()
            .filter(|scope| scope.session_id.as_deref() == Some(session_id))
            .collect())
    }

    pub async fn list_by_agent(
        &self,
        agent_id: &str,
    ) -> anyhow::Result<Vec<nuka_domain::memory::MemoryScope>> {
        let items = self.list_all().await?;
        Ok(items
            .into_iter()
            .filter(|scope| scope.agent_id.as_deref() == Some(agent_id))
            .collect())
    }

    async fn list_all(&self) -> anyhow::Result<Vec<nuka_domain::memory::MemoryScope>> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::memory::MemoryScopeRepository::new(self.pool.clone())
            .list()
            .await
    }

    pub(crate) async fn record_runtime_candidate(
        &self,
        surface: nuka_domain::memory::MemorySurface,
        owner_id: &str,
        prompt: &str,
        reason: &str,
        scope: nuka_domain::memory::MemoryScope,
    ) -> anyhow::Result<nuka_domain::memory::MemoryCandidate> {
        nuka_storage::migrations::run(&self.pool).await?;

        let node_id = uuid::Uuid::new_v4().to_string();
        let candidate_id = uuid::Uuid::new_v4().to_string();
        let title = summarize_runtime_candidate_title(prompt);
        let body = build_runtime_candidate_body(prompt, reason);
        let graph_repository = nuka_storage::memory::MemoryGraphRepository::new(self.pool.clone());
        let scope_repository = nuka_storage::memory::MemoryScopeRepository::new(self.pool.clone());

        scope_repository.upsert(scope.clone()).await?;
        let previous_node_id = graph_repository
            .load_graph_for_scope(Some(&scope.id))
            .await?
            .nodes
            .last()
            .map(|node| node.id.clone());

        graph_repository
            .upsert_node(nuka_domain::memory::MemoryGraphNode {
                id: node_id.clone(),
                kind: nuka_domain::memory::MemoryNodeKind::Fact,
                title: title.clone(),
                body: Some(body),
                trace_type: nuka_domain::memory::MemoryTraceType::Working,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::Candidate,
            })
            .await?;
        graph_repository
            .bind_node_to_scope(&node_id, &scope.id)
            .await?;
        if let Some(source_id) = previous_node_id {
            graph_repository
                .create_edge(nuka_domain::memory::MemoryGraphEdge {
                    id: uuid::Uuid::new_v4().to_string(),
                    source_id,
                    target_id: node_id.clone(),
                    relation: "follows".to_string(),
                })
                .await?;
        }

        let repository = nuka_storage::memory::MemoryCandidateRepository::new(self.pool.clone());
        repository
            .create_pending(nuka_domain::memory::MemoryCandidate {
                id: candidate_id.clone(),
                node_id: node_id.clone(),
                title: title.clone(),
                surface,
                owner_id: owner_id.to_string(),
                suggested_schema_id: None,
                confidence: 0.72,
                reason: reason.to_string(),
                evidence_count: 0,
            })
            .await?;
        repository.add_evidence(&candidate_id, prompt).await?;

        repository
            .get(&candidate_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("memory candidate was not persisted"))
    }
}

fn workflow_scope(workflow_id: &str) -> nuka_domain::memory::MemoryScope {
    nuka_domain::memory::MemoryScope {
        id: format!("workflow:{workflow_id}"),
        name: format_workflow_scope_name(workflow_id),
        workflow_id: Some(workflow_id.to_string()),
        session_id: None,
        agent_id: None,
    }
}

fn format_workflow_scope_name(workflow_id: &str) -> String {
    workflow_id
        .strip_prefix("workflow-")
        .unwrap_or(workflow_id)
        .split('-')
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            let mut chars = segment.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn summarize_runtime_candidate_title(prompt: &str) -> String {
    let detail = build_runtime_candidate_detail(prompt);
    let summary = detail
        .split(['\n', '。', '！', '？', '!', '?', ';', '；', '，', ','])
        .find(|segment| !segment.trim().is_empty())
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .unwrap_or(detail.as_str());

    let concise = if let Some((subject, predicate)) = summary.split_once("需要") {
        format!("{}{}", subject.trim(), predicate.trim())
    } else {
        summary
            .trim_start_matches("要在")
            .trim_start_matches("在")
            .trim_start_matches("将")
            .trim()
            .to_string()
    };

    truncate_memory_text(&concise, 24)
}

fn build_runtime_candidate_body(prompt: &str, reason: &str) -> String {
    let detail = build_runtime_candidate_detail(prompt);
    let locations = extract_memory_locations(prompt);
    let reason = normalize_memory_text(reason);
    let mut sections = vec![format!("详细记录：{detail}")];

    if !locations.is_empty() {
        sections.push(format!("相关位置：{}", locations.join("、")));
    }

    if !reason.is_empty() {
        sections.push(format!("记录缘由：{reason}"));
    }

    sections.join("\n")
}

fn build_runtime_candidate_detail(prompt: &str) -> String {
    let normalized = normalize_memory_text(prompt);
    let without_locations = extract_memory_locations(prompt)
        .into_iter()
        .fold(normalized, |current, location| {
            current.replace(&location, "")
        });
    let trimmed = without_locations
        .trim_start_matches("记住 ")
        .trim_start_matches("记下 ")
        .trim_start_matches("Remember ")
        .trim_start_matches("Capture ")
        .trim_start_matches("在 ")
        .trim_start_matches("于 ")
        .trim();
    let cleaned = trimmed
        .trim_start_matches("里的")
        .trim_start_matches("里")
        .trim_start_matches("中的")
        .trim_start_matches("中")
        .trim_start_matches("需要")
        .trim_start_matches("要把")
        .trim_start_matches("要将")
        .trim_matches(|character: char| {
            matches!(
                character,
                ' ' | '\n' | '\t' | '，' | ',' | '。' | '；' | ';' | '：' | ':'
            )
        })
        .trim();

    if cleaned.is_empty() {
        normalize_memory_text(prompt)
    } else {
        cleaned.to_string()
    }
}

fn extract_memory_locations(prompt: &str) -> Vec<String> {
    let normalized = normalize_memory_text(prompt);
    let mut locations = Vec::new();

    for token in normalized.split(' ') {
        let candidate = token.trim_matches(|character: char| {
            matches!(
                character,
                ' ' | '\n'
                    | '\t'
                    | '，'
                    | ','
                    | '。'
                    | '；'
                    | ';'
                    | '：'
                    | ':'
                    | '('
                    | ')'
                    | '（'
                    | '）'
                    | '"'
                    | '\''
            )
        });

        if looks_like_location(candidate) && !locations.iter().any(|value| value == candidate) {
            locations.push(candidate.to_string());
        }
    }

    locations
}

fn looks_like_location(value: &str) -> bool {
    value.contains('/')
        && value
            .rsplit('/')
            .next()
            .map(|segment| segment.contains('.'))
            .unwrap_or(false)
}

fn normalize_memory_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_memory_text(value: &str, max_chars: usize) -> String {
    let trimmed = value.trim();
    let characters: Vec<char> = trimmed.chars().collect();

    if characters.len() <= max_chars {
        return trimmed.to_string();
    }

    let keep = max_chars.saturating_sub(1);
    let shortened = characters[..keep]
        .iter()
        .collect::<String>()
        .trim_end()
        .to_string();
    format!("{shortened}…")
}

#[cfg(test)]
mod tests {
    use super::MemoryService;
    use nuka_domain::memory::{
        MemoryGraphEdge, MemoryGraphNode, MemoryNodeKind, MemorySurface, MemoryTraceType,
        ReviewDecision,
    };

    #[tokio::test]
    async fn memory_service_updates_node_title_and_body() {
        let service = MemoryService::new_for_test();
        service
            .upsert_node(MemoryGraphNode {
                id: "memory-review".to_string(),
                kind: MemoryNodeKind::Fact,
                title: "Review Memory".to_string(),
                body: Some("Tracks the latest review conclusions.".to_string()),
                trace_type: MemoryTraceType::Semantic,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::None,
            })
            .await
            .unwrap();

        service
            .update_node(
                "memory-review",
                "Release Review Memory".to_string(),
                Some("Captures release blockers and sign-off notes.".to_string()),
            )
            .await
            .unwrap();

        let graph = service.load_graph().await.unwrap();
        let node = graph
            .nodes
            .into_iter()
            .find(|entry| entry.id == "memory-review")
            .expect("updated node should exist");

        assert_eq!(node.title, "Release Review Memory");
        assert_eq!(
            node.body.as_deref(),
            Some("Captures release blockers and sign-off notes."),
        );
    }

    #[tokio::test]
    async fn memory_service_deletes_node_and_connected_edges() {
        let service = MemoryService::new_for_test();
        service
            .upsert_node(MemoryGraphNode {
                id: "memory-review".to_string(),
                kind: MemoryNodeKind::Fact,
                title: "Review Memory".to_string(),
                body: Some("Tracks the latest review conclusions.".to_string()),
                trace_type: MemoryTraceType::Semantic,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::None,
            })
            .await
            .unwrap();
        service
            .upsert_node(MemoryGraphNode {
                id: "workflow-review".to_string(),
                kind: MemoryNodeKind::Workflow,
                title: "Release Workflow".to_string(),
                body: Some("Coordinates the release review.".to_string()),
                trace_type: MemoryTraceType::Semantic,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::None,
            })
            .await
            .unwrap();
        service
            .create_edge(MemoryGraphEdge {
                id: "edge-review".to_string(),
                source_id: "workflow-review".to_string(),
                target_id: "memory-review".to_string(),
                relation: "captures".to_string(),
            })
            .await
            .unwrap();

        service.delete_node("memory-review").await.unwrap();

        let graph = service.load_graph().await.unwrap();
        assert!(graph.nodes.iter().all(|node| node.id != "memory-review"));
        assert!(graph.edges.is_empty(), "connected edges should be deleted");
    }

    #[tokio::test]
    async fn reviewing_semantic_promotion_creates_semantic_node_and_snapshot() {
        let service = MemoryService::new_for_test();
        let candidate = service
            .create_candidate_for_test("release-policy")
            .await
            .unwrap();

        service
            .review_candidate(&candidate.id, ReviewDecision::PromoteSemantic)
            .await
            .unwrap();

        let graph = service.load_graph().await.unwrap();
        let snapshots = service.list_snapshots().await.unwrap();

        assert!(graph
            .nodes
            .iter()
            .any(|node| node.trace_type == MemoryTraceType::Semantic));
        assert!(!snapshots.is_empty());
    }

    #[tokio::test]
    async fn workflow_event_hook_generates_candidate_instead_of_auto_promotion() {
        let service = MemoryService::new_for_test();
        service
            .handle_runtime_event(crate::runtime_events::RuntimeEvent::WorkflowTurnCompleted {
                session_id: "session-release".to_string(),
                workflow_id: "workflow-release-notes".to_string(),
                prompt: "Summarize the release handoff".to_string(),
            })
            .await
            .unwrap();

        let graph = service.load_graph().await.unwrap();
        let pending = service.list_pending_candidates().await.unwrap();

        assert_eq!(pending.len(), 1);
        assert!(graph
            .nodes
            .iter()
            .all(|node| node.trace_type != MemoryTraceType::Semantic));
    }

    #[tokio::test]
    async fn runtime_events_create_world_and_workflow_memory_scopes() {
        let service = MemoryService::new_for_test();
        service
            .handle_runtime_event(crate::runtime_events::RuntimeEvent::ChatTurnCompleted {
                session_id: "session-world".to_string(),
                prompt: "Remember the world note".to_string(),
            })
            .await
            .unwrap();
        service
            .handle_runtime_event(crate::runtime_events::RuntimeEvent::WorkflowTurnCompleted {
                session_id: "session-release".to_string(),
                workflow_id: "workflow-release-notes".to_string(),
                prompt: "Remember the workflow note".to_string(),
            })
            .await
            .unwrap();

        let scopes = service.list_scopes().await.unwrap();

        assert!(scopes.iter().any(|scope| {
            scope.id == "world"
                && scope.name == "World"
                && scope.workflow_id.is_none()
                && scope.session_id.is_none()
                && scope.agent_id.is_none()
        }));
        assert!(scopes.iter().any(|scope| {
            scope.id == "workflow:workflow-release-notes"
                && scope.workflow_id.as_deref() == Some("workflow-release-notes")
        }));
    }

    #[tokio::test]
    async fn runtime_candidates_use_brief_titles_and_keep_reason_in_detailed_body() {
        let service = MemoryService::new_for_test();
        let candidate = service
            .record_runtime_candidate(
                MemorySurface::Workflow,
                "workflow-release-audit",
                "记住 apps/desktop/src-tauri/src/commands/team.rs 里要在创建 team run 后发出 TeamRunStarted 事件，这样协作团队记忆图才能连起来并保持正确 owner。",
                "Team memory graph stayed empty during desktop acceptance.",
                super::workflow_scope("workflow-release-audit"),
            )
            .await
            .unwrap();

        let graph = service
            .load_graph_for_scope(Some("workflow:workflow-release-audit"))
            .await
            .unwrap();
        let node = graph
            .nodes
            .into_iter()
            .find(|entry| entry.id == candidate.node_id)
            .expect("candidate node should exist");
        let body = node.body.expect("candidate body should exist");

        assert!(candidate.title.chars().count() <= 36);
        assert_ne!(node.title, body);
        assert!(!candidate
            .title
            .contains("apps/desktop/src-tauri/src/commands/team.rs"));
        assert!(body.contains("apps/desktop/src-tauri/src/commands/team.rs"));
        assert!(body.contains("相关位置：apps/desktop/src-tauri/src/commands/team.rs"));
        assert!(body.contains("详细记录："));
        assert!(body.contains("记录缘由"));
        assert!(body.contains("Team memory graph stayed empty during desktop acceptance."));
    }

    #[tokio::test]
    async fn chat_runtime_event_localizes_memory_reason_and_keeps_title_brief() {
        let service = MemoryService::new_for_test();

        service
            .handle_runtime_event(crate::runtime_events::RuntimeEvent::ChatTurnCompleted {
                session_id: "chat-session-1".to_string(),
                prompt: "记住 apps/desktop/src/features/chat/ChatPage.tsx 里的路由徽标需要显示有效 provider 与 model，并保留失败原因。".to_string(),
            })
            .await
            .unwrap();

        let candidate = service
            .list_pending_candidates()
            .await
            .unwrap()
            .into_iter()
            .find(|entry| entry.owner_id == "chat-session-1")
            .expect("chat candidate should exist");
        let graph = service.load_graph_for_scope(Some("world")).await.unwrap();
        let node = graph
            .nodes
            .into_iter()
            .find(|entry| entry.id == candidate.node_id)
            .expect("candidate node should exist");
        let body = node.body.expect("candidate body should exist");

        assert!(candidate.title.chars().count() <= 24);
        assert_ne!(node.title, body);
        assert!(!candidate.title.contains("ChatPage.tsx"));
        assert!(body.contains("ChatPage.tsx"));
        assert!(body.contains("相关位置：apps/desktop/src/features/chat/ChatPage.tsx"));
        assert!(body.contains("详细记录："));
        assert!(body.contains("记录缘由：这条对话已进入记忆审核。"));
        assert!(!body.contains("Chat turn proposed for review"));
    }
}
