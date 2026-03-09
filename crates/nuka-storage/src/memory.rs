use nuka_domain::memory::{MemoryGraph, MemoryGraphEdge, MemoryGraphNode, MemoryNodeKind, MemoryScope};
use sqlx::Row;

pub struct MemoryGraphRepository {
    pool: sqlx::SqlitePool,
}

impl MemoryGraphRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn load_graph(&self) -> anyhow::Result<MemoryGraph> {
        self.ensure_graph_schema().await?;

        let node_rows = sqlx::query(
            "select id, kind, title, body from memory_nodes order by created_at asc, id asc",
        )
        .fetch_all(&self.pool)
        .await?;
        let edge_rows = sqlx::query(
            "select id, source_id, target_id, relation from memory_edges order by created_at asc, id asc",
        )
        .fetch_all(&self.pool)
        .await?;
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
            insert into memory_nodes (id, kind, title, body, created_at, updated_at)
            values (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))
            on conflict(id) do update set
              kind = excluded.kind,
              title = excluded.title,
              body = excluded.body,
              updated_at = datetime('now')
            "#,
        )
        .bind(node.id)
        .bind(node.kind.as_str())
        .bind(node.title)
        .bind(node.body)
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

    async fn get_node(&self, node_id: &str) -> anyhow::Result<Option<MemoryGraphNode>> {
        let row = sqlx::query("select id, kind, title, body from memory_nodes where id = ?1")
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
        sqlx::query(
            r#"
            create table if not exists memory_nodes (
              id text primary key,
              kind text not null,
              title text not null,
              body text,
              created_at text not null,
              updated_at text not null
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            create table if not exists memory_edges (
              id text primary key,
              source_id text not null references memory_nodes(id) on delete cascade,
              target_id text not null references memory_nodes(id) on delete cascade,
              relation text not null,
              created_at text not null
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "create unique index if not exists memory_edges_relation_idx on memory_edges(source_id, target_id, relation)",
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

pub struct MemoryScopeRepository {
    pool: sqlx::SqlitePool,
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

#[cfg(test)]
mod tests {
    use nuka_domain::memory::{MemoryGraphEdge, MemoryGraphNode, MemoryNodeKind};

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
            })
            .await
            .unwrap();
        repository
            .upsert_node(MemoryGraphNode {
                id: "memory-review".to_string(),
                kind: MemoryNodeKind::Fact,
                title: "Review Memory".to_string(),
                body: Some("Tracks the latest review conclusions.".to_string()),
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
}
