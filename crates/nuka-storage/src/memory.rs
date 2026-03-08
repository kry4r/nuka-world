use nuka_domain::memory::MemoryScope;
use sqlx::Row;

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
