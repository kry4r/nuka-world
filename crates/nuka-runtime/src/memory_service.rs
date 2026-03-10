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
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::memory::MemoryGraphRepository::new(self.pool.clone())
            .load_graph()
            .await
    }

    pub async fn upsert_node(
        &self,
        node: nuka_domain::memory::MemoryGraphNode,
    ) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::memory::MemoryGraphRepository::new(self.pool.clone())
            .upsert_node(node)
            .await
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
                node.consolidation_state =
                    nuka_domain::memory::MemoryConsolidationState::Approved;
            }
            nuka_domain::memory::ReviewDecision::KeepEpisodic => {
                node.trace_type = nuka_domain::memory::MemoryTraceType::Episodic;
                node.consolidation_state =
                    nuka_domain::memory::MemoryConsolidationState::Approved;
            }
            nuka_domain::memory::ReviewDecision::Reject => {
                node.consolidation_state =
                    nuka_domain::memory::MemoryConsolidationState::Rejected;
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
        candidate_repository.mark_reviewed(candidate_id, decision).await?;

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
    ) -> anyhow::Result<nuka_domain::memory::MemoryCandidate> {
        nuka_storage::migrations::run(&self.pool).await?;

        let node_id = uuid::Uuid::new_v4().to_string();
        let candidate_id = uuid::Uuid::new_v4().to_string();
        let title = prompt.chars().take(48).collect::<String>();

        nuka_storage::memory::MemoryGraphRepository::new(self.pool.clone())
            .upsert_node(nuka_domain::memory::MemoryGraphNode {
                id: node_id.clone(),
                kind: nuka_domain::memory::MemoryNodeKind::Fact,
                title: title.clone(),
                body: Some(prompt.to_string()),
                trace_type: nuka_domain::memory::MemoryTraceType::Working,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::Candidate,
            })
            .await?;

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

#[cfg(test)]
mod tests {
    use super::MemoryService;
    use nuka_domain::memory::{
        MemoryGraphEdge, MemoryGraphNode, MemoryNodeKind, MemoryTraceType, ReviewDecision,
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
}
