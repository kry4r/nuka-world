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
}

#[cfg(test)]
mod tests {
    use super::MemoryService;
    use nuka_domain::memory::{MemoryGraphEdge, MemoryGraphNode, MemoryNodeKind};

    #[tokio::test]
    async fn memory_service_updates_node_title_and_body() {
        let service = MemoryService::new_for_test();
        service
            .upsert_node(MemoryGraphNode {
                id: "memory-review".to_string(),
                kind: MemoryNodeKind::Fact,
                title: "Review Memory".to_string(),
                body: Some("Tracks the latest review conclusions.".to_string()),
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
            })
            .await
            .unwrap();
        service
            .upsert_node(MemoryGraphNode {
                id: "workflow-review".to_string(),
                kind: MemoryNodeKind::Workflow,
                title: "Release Workflow".to_string(),
                body: Some("Coordinates the release review.".to_string()),
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
}
