use sqlx::Row;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredWorkflowTemplate {
    pub id: String,
    pub name: String,
    pub saved: bool,
    pub created_at: String,
}

pub struct WorkflowRepository {
    pool: sqlx::SqlitePool,
}

impl WorkflowRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert_template(&self, name: &str) -> anyhow::Result<()> {
        sqlx::query(
            "insert into workflows (id, name, saved, created_at) values (?1, ?2, 1, datetime('now'))",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(name)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_templates(&self) -> anyhow::Result<Vec<StoredWorkflowTemplate>> {
        let rows = sqlx::query(
            "select id, name, saved, created_at from workflows order by created_at asc",
        )
        .fetch_all(&self.pool)
        .await?;

        let items = rows
            .into_iter()
            .map(|row| StoredWorkflowTemplate {
                id: row.get("id"),
                name: row.get("name"),
                saved: row.get::<i64, _>("saved") != 0,
                created_at: row.get("created_at"),
            })
            .collect();

        Ok(items)
    }
}
