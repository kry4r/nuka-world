use nuka_domain::memory::{
    MemoryCandidate, MemoryConsolidationState, MemoryGraph, MemoryGraphEdge, MemoryGraphNode,
    MemoryNodeKind, MemoryReviewAction, MemoryScope, MemorySnapshot, MemorySurface,
    MemoryTraceType, ReviewDecision,
};
use sqlx::Row;

pub struct MemoryGraphRepository {
    pool: sqlx::SqlitePool,
}

impl MemoryGraphRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn load_graph(&self) -> anyhow::Result<MemoryGraph> {
        self.load_graph_for_scope(None).await
    }

    pub async fn load_graph_for_scope(&self, scope_id: Option<&str>) -> anyhow::Result<MemoryGraph> {
        self.ensure_graph_schema().await?;

        let node_rows = if let Some(scope_id) = scope_id {
            sqlx::query(
                r#"
                select n.id, n.kind, n.title, n.body, n.trace_type, n.consolidation_state
                from memory_nodes n
                inner join memory_node_scopes s on s.node_id = n.id
                where s.scope_id = ?1
                order by n.created_at asc, n.id asc
                "#,
            )
            .bind(scope_id)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query(
                "select id, kind, title, body, trace_type, consolidation_state from memory_nodes order by created_at asc, id asc",
            )
            .fetch_all(&self.pool)
            .await?
        };
        let edge_rows = if let Some(scope_id) = scope_id {
            sqlx::query(
                r#"
                select e.id, e.source_id, e.target_id, e.relation
                from memory_edges e
                inner join memory_node_scopes source_scope on source_scope.node_id = e.source_id
                inner join memory_node_scopes target_scope on target_scope.node_id = e.target_id
                where source_scope.scope_id = ?1 and target_scope.scope_id = ?1
                order by e.created_at asc, e.id asc
                "#,
            )
            .bind(scope_id)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query(
                "select id, source_id, target_id, relation from memory_edges order by created_at asc, id asc",
            )
            .fetch_all(&self.pool)
            .await?
        };
        let nodes = node_rows
            .into_iter()
            .map(read_node)
            .collect::<anyhow::Result<Vec<_>>>()?;

        Ok(MemoryGraph {
            nodes,
            edges: edge_rows.into_iter().map(read_edge).collect(),
        })
    }

    pub async fn upsert_node(&self, node: MemoryGraphNode) -> anyhow::Result<()> {
        self.ensure_graph_schema().await?;

        sqlx::query(
            r#"
            insert into memory_nodes (id, kind, title, body, trace_type, consolidation_state, created_at, updated_at)
            values (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now'))
            on conflict(id) do update set
              kind = excluded.kind,
              title = excluded.title,
              body = excluded.body,
              trace_type = excluded.trace_type,
              consolidation_state = excluded.consolidation_state,
              updated_at = datetime('now')
            "#,
        )
        .bind(node.id)
        .bind(node.kind.as_str())
        .bind(node.title)
        .bind(node.body)
        .bind(node.trace_type.as_str())
        .bind(node.consolidation_state.as_str())
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn bind_node_to_scope(&self, node_id: &str, scope_id: &str) -> anyhow::Result<()> {
        self.ensure_graph_schema().await?;

        sqlx::query(
            r#"
            insert into memory_node_scopes (node_id, scope_id, created_at)
            values (?1, ?2, datetime('now'))
            on conflict(node_id) do update set
              scope_id = excluded.scope_id
            "#,
        )
        .bind(node_id)
        .bind(scope_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn update_node(
        &self,
        node_id: &str,
        title: &str,
        body: Option<&str>,
    ) -> anyhow::Result<Option<MemoryGraphNode>> {
        self.ensure_graph_schema().await?;

        let result = sqlx::query(
            r#"
            update memory_nodes
            set title = ?2,
                body = ?3,
                updated_at = datetime('now')
            where id = ?1
            "#,
        )
        .bind(node_id)
        .bind(title)
        .bind(body)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Ok(None);
        }

        self.get_node(node_id).await
    }

    pub async fn delete_node(&self, node_id: &str) -> anyhow::Result<()> {
        self.ensure_graph_schema().await?;

        sqlx::query("delete from memory_nodes where id = ?1")
            .bind(node_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn create_edge(&self, edge: MemoryGraphEdge) -> anyhow::Result<MemoryGraphEdge> {
        self.ensure_graph_schema().await?;
        let source_id = edge.source_id.clone();
        let target_id = edge.target_id.clone();
        let relation = edge.relation.clone();

        sqlx::query(
            r#"
            insert into memory_edges (id, source_id, target_id, relation, created_at)
            values (?1, ?2, ?3, ?4, datetime('now'))
            on conflict(source_id, target_id, relation) do update set
              relation = excluded.relation
            "#,
        )
        .bind(edge.id)
        .bind(edge.source_id)
        .bind(edge.target_id)
        .bind(edge.relation)
        .execute(&self.pool)
        .await?;

        self.get_edge_by_relation(&source_id, &target_id, &relation)
            .await?
            .ok_or_else(|| anyhow::anyhow!("memory edge was not persisted"))
    }

    pub async fn delete_edge(&self, edge_id: &str) -> anyhow::Result<()> {
        self.ensure_graph_schema().await?;

        sqlx::query("delete from memory_edges where id = ?1")
            .bind(edge_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn get_node(&self, node_id: &str) -> anyhow::Result<Option<MemoryGraphNode>> {
        self.ensure_graph_schema().await?;

        let row = sqlx::query(
            "select id, kind, title, body, trace_type, consolidation_state from memory_nodes where id = ?1",
        )
            .bind(node_id)
            .fetch_optional(&self.pool)
            .await?;

        row.map(read_node).transpose()
    }

    async fn get_edge_by_relation(
        &self,
        source_id: &str,
        target_id: &str,
        relation: &str,
    ) -> anyhow::Result<Option<MemoryGraphEdge>> {
        let row = sqlx::query(
            "select id, source_id, target_id, relation from memory_edges where source_id = ?1 and target_id = ?2 and relation = ?3",
        )
        .bind(source_id)
        .bind(target_id)
        .bind(relation)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(read_edge))
    }

    async fn ensure_graph_schema(&self) -> anyhow::Result<()> {
        crate::migrations::run(&self.pool).await
    }
}

pub struct MemoryScopeRepository {
    pool: sqlx::SqlitePool,
}

pub struct MemoryCandidateRepository {
    pool: sqlx::SqlitePool,
}

impl MemoryCandidateRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create_pending(&self, candidate: MemoryCandidate) -> anyhow::Result<()> {
        crate::migrations::run(&self.pool).await?;

        sqlx::query(
            r#"
            insert into memory_candidates (
              id,
              node_id,
              title,
              surface,
              owner_id,
              suggested_schema_id,
              confidence,
              reason,
              status,
              created_at,
              reviewed_at
            )
            values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', datetime('now'), null)
            "#,
        )
        .bind(candidate.id)
        .bind(candidate.node_id)
        .bind(candidate.title)
        .bind(candidate.surface.as_str())
        .bind(candidate.owner_id)
        .bind(candidate.suggested_schema_id)
        .bind(candidate.confidence)
        .bind(candidate.reason)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn add_evidence(&self, candidate_id: &str, detail: &str) -> anyhow::Result<()> {
        crate::migrations::run(&self.pool).await?;

        sqlx::query(
            r#"
            insert into memory_candidate_evidence (id, candidate_id, detail, created_at)
            values (?1, ?2, ?3, datetime('now'))
            "#,
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(candidate_id)
        .bind(detail)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get(&self, candidate_id: &str) -> anyhow::Result<Option<MemoryCandidate>> {
        crate::migrations::run(&self.pool).await?;

        let row = sqlx::query(
            r#"
            select
              c.id,
              c.node_id,
              c.title,
              c.surface,
              c.owner_id,
              c.suggested_schema_id,
              c.confidence,
              c.reason,
              count(e.id) as evidence_count
            from memory_candidates c
            left join memory_candidate_evidence e on e.candidate_id = c.id
            where c.id = ?1
            group by c.id, c.node_id, c.title, c.surface, c.owner_id, c.suggested_schema_id, c.confidence, c.reason
            "#,
        )
        .bind(candidate_id)
        .fetch_optional(&self.pool)
        .await?;

        row.map(read_candidate).transpose()
    }

    pub async fn list_pending(&self) -> anyhow::Result<Vec<MemoryCandidate>> {
        crate::migrations::run(&self.pool).await?;

        let rows = sqlx::query(
            r#"
            select
              c.id,
              c.node_id,
              c.title,
              c.surface,
              c.owner_id,
              c.suggested_schema_id,
              c.confidence,
              c.reason,
              count(e.id) as evidence_count
            from memory_candidates c
            left join memory_candidate_evidence e on e.candidate_id = c.id
            where c.status = 'pending'
            group by c.id, c.node_id, c.title, c.surface, c.owner_id, c.suggested_schema_id, c.confidence, c.reason
            order by c.created_at asc, c.id asc
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(read_candidate).collect()
    }

    pub async fn mark_reviewed(
        &self,
        candidate_id: &str,
        decision: ReviewDecision,
    ) -> anyhow::Result<()> {
        crate::migrations::run(&self.pool).await?;

        let status = match decision {
            ReviewDecision::PromoteSemantic | ReviewDecision::KeepEpisodic => "approved",
            ReviewDecision::Reject => "rejected",
        };

        sqlx::query(
            r#"
            update memory_candidates
            set status = ?2,
                reviewed_at = datetime('now')
            where id = ?1
            "#,
        )
        .bind(candidate_id)
        .bind(status)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

pub struct MemorySnapshotRepository {
    pool: sqlx::SqlitePool,
}

impl MemorySnapshotRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, snapshot: MemorySnapshot) -> anyhow::Result<()> {
        crate::migrations::run(&self.pool).await?;

        sqlx::query(
            r#"
            insert into memory_snapshots (id, node_id, title, body, trace_type, created_at)
            values (?1, ?2, ?3, ?4, ?5, datetime('now'))
            "#,
        )
        .bind(snapshot.id)
        .bind(snapshot.node_id)
        .bind(snapshot.title)
        .bind(snapshot.body)
        .bind(snapshot.trace_type.as_str())
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list(&self) -> anyhow::Result<Vec<MemorySnapshot>> {
        crate::migrations::run(&self.pool).await?;

        let rows = sqlx::query(
            "select id, node_id, title, body, trace_type from memory_snapshots order by created_at asc, id asc",
        )
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(read_snapshot).collect()
    }
}

pub struct MemoryReviewActionRepository {
    pool: sqlx::SqlitePool,
}

impl MemoryReviewActionRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, action: MemoryReviewAction) -> anyhow::Result<()> {
        crate::migrations::run(&self.pool).await?;

        sqlx::query(
            r#"
            insert into memory_review_actions (id, candidate_id, node_id, decision, created_at)
            values (?1, ?2, ?3, ?4, datetime('now'))
            "#,
        )
        .bind(action.id)
        .bind(action.candidate_id)
        .bind(action.node_id)
        .bind(action.decision.as_str())
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

impl MemoryScopeRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert(&self, scope: MemoryScope) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            insert into memory_scopes (id, name, workflow_id, session_id, agent_id, created_at)
            values (?1, ?2, ?3, ?4, ?5, datetime('now'))
            on conflict(id) do update set
              name = excluded.name,
              workflow_id = excluded.workflow_id,
              session_id = excluded.session_id,
              agent_id = excluded.agent_id
            "#,
        )
        .bind(scope.id)
        .bind(scope.name)
        .bind(scope.workflow_id)
        .bind(scope.session_id)
        .bind(scope.agent_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list(&self) -> anyhow::Result<Vec<MemoryScope>> {
        let rows = sqlx::query(
            "select id, name, workflow_id, session_id, agent_id from memory_scopes order by created_at asc",
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| MemoryScope {
                id: row.get("id"),
                name: row.get("name"),
                workflow_id: row.get("workflow_id"),
                session_id: row.get("session_id"),
                agent_id: row.get("agent_id"),
            })
            .collect())
    }
}

fn read_node(row: sqlx::sqlite::SqliteRow) -> anyhow::Result<MemoryGraphNode> {
    Ok(MemoryGraphNode {
        id: row.get("id"),
        kind: MemoryNodeKind::from_str(&row.get::<String, _>("kind")).map_err(anyhow::Error::msg)?,
        title: row.get("title"),
        body: row.get("body"),
        trace_type: MemoryTraceType::from_str(&row.get::<String, _>("trace_type"))
            .map_err(anyhow::Error::msg)?,
        consolidation_state: MemoryConsolidationState::from_str(
            &row.get::<String, _>("consolidation_state"),
        )
        .map_err(anyhow::Error::msg)?,
    })
}

fn read_edge(row: sqlx::sqlite::SqliteRow) -> MemoryGraphEdge {
    MemoryGraphEdge {
        id: row.get("id"),
        source_id: row.get("source_id"),
        target_id: row.get("target_id"),
        relation: row.get("relation"),
    }
}

fn read_candidate(row: sqlx::sqlite::SqliteRow) -> anyhow::Result<MemoryCandidate> {
    Ok(MemoryCandidate {
        id: row.get("id"),
        node_id: row.get("node_id"),
        title: row.get("title"),
        surface: MemorySurface::from_str(&row.get::<String, _>("surface"))
            .map_err(anyhow::Error::msg)?,
        owner_id: row.get("owner_id"),
        suggested_schema_id: row.get("suggested_schema_id"),
        confidence: row.get::<f64, _>("confidence") as f32,
        reason: row.get("reason"),
        evidence_count: row.get::<i64, _>("evidence_count") as usize,
    })
}

fn read_snapshot(row: sqlx::sqlite::SqliteRow) -> anyhow::Result<MemorySnapshot> {
    Ok(MemorySnapshot {
        id: row.get("id"),
        node_id: row.get("node_id"),
        title: row.get("title"),
        body: row.get("body"),
        trace_type: MemoryTraceType::from_str(&row.get::<String, _>("trace_type"))
            .map_err(anyhow::Error::msg)?,
    })
}

#[cfg(test)]
mod tests {
    use nuka_domain::memory::{
        MemoryCandidate, MemoryGraphEdge, MemoryGraphNode, MemoryNodeKind, MemorySurface,
        MemoryTraceType,
    };

    #[tokio::test]
    async fn memory_graph_repository_rejects_unknown_persisted_node_kind() {
        let pool = crate::db::open_in_memory().await.unwrap();
        let repository = super::MemoryGraphRepository::new(pool.clone());

        repository
            .upsert_node(MemoryGraphNode {
                id: "workflow-review".to_string(),
                kind: MemoryNodeKind::Workflow,
                title: "Release Workflow".to_string(),
                body: Some("Coordinates release validation.".to_string()),
                trace_type: MemoryTraceType::Semantic,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::None,
            })
            .await
            .unwrap();

        sqlx::query(
            "insert into memory_nodes (id, kind, title, body, created_at, updated_at) values (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))",
        )
        .bind("memory-invalid")
        .bind("timeline")
        .bind("Timeline Memory")
        .bind("Should fail to decode.")
        .execute(&pool)
        .await
        .unwrap();

        let error = repository.load_graph().await.unwrap_err();

        assert_eq!(error.to_string(), "unknown memory node kind: timeline");
    }

    #[tokio::test]
    async fn memory_graph_repository_keeps_distinct_edges_for_distinct_relations() {
        let pool = crate::db::open_in_memory().await.unwrap();
        let repository = super::MemoryGraphRepository::new(pool);

        repository
            .upsert_node(MemoryGraphNode {
                id: "workflow-review".to_string(),
                kind: MemoryNodeKind::Workflow,
                title: "Release Workflow".to_string(),
                body: Some("Coordinates release validation.".to_string()),
                trace_type: MemoryTraceType::Semantic,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::None,
            })
            .await
            .unwrap();
        repository
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

        repository
            .create_edge(MemoryGraphEdge {
                id: "edge-review-captures".to_string(),
                source_id: "workflow-review".to_string(),
                target_id: "memory-review".to_string(),
                relation: "captures".to_string(),
            })
            .await
            .unwrap();
        repository
            .create_edge(MemoryGraphEdge {
                id: "edge-review-supports".to_string(),
                source_id: "workflow-review".to_string(),
                target_id: "memory-review".to_string(),
                relation: "supports".to_string(),
            })
            .await
            .unwrap();

        let graph = repository.load_graph().await.unwrap();

        assert_eq!(graph.edges.len(), 2);
        assert!(graph.edges.iter().any(|edge| edge.id == "edge-review-captures"));
        assert!(graph.edges.iter().any(|edge| edge.id == "edge-review-supports"));
    }

    #[tokio::test]
    async fn memory_graph_repository_round_trips_trace_type_and_pending_candidate_evidence() {
        let pool = crate::db::open_in_memory().await.unwrap();
        let graph_repository = super::MemoryGraphRepository::new(pool.clone());
        let candidate_repository = super::MemoryCandidateRepository::new(pool.clone());

        graph_repository
            .upsert_node(MemoryGraphNode {
                id: "memory-release-policy".to_string(),
                kind: MemoryNodeKind::Fact,
                title: "Release Policy".to_string(),
                body: Some("Every release needs a handoff checklist.".to_string()),
                trace_type: MemoryTraceType::Working,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::Candidate,
            })
            .await
            .unwrap();

        candidate_repository
            .create_pending(MemoryCandidate {
                id: "candidate-release-policy".to_string(),
                node_id: "memory-release-policy".to_string(),
                title: "Release Policy".to_string(),
                surface: MemorySurface::Workflow,
                owner_id: "workflow-release-notes".to_string(),
                suggested_schema_id: Some("schema-release".to_string()),
                confidence: 0.82,
                reason: "Repeated release handoff guidance".to_string(),
                evidence_count: 0,
            })
            .await
            .unwrap();
        candidate_repository
            .add_evidence(
                "candidate-release-policy",
                "The workflow mentioned a release handoff checklist.",
            )
            .await
            .unwrap();

        let graph = graph_repository.load_graph().await.unwrap();
        let pending = candidate_repository.list_pending().await.unwrap();

        assert_eq!(graph.nodes[0].trace_type, MemoryTraceType::Working);
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].evidence_count, 1);
    }
}
