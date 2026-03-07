use nuka_domain::workflow::{WorkflowTemplate, WorkflowVisibility};
use sqlx::Row;

pub struct WorkflowRepository {
    pool: sqlx::SqlitePool,
}

impl WorkflowRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert_template(&self, name: &str) -> anyhow::Result<()> {
        sqlx::query(
            "insert into workflows (id, name, saved, visibility, created_at) values (?1, ?2, 1, ?3, datetime('now'))",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(name)
        .bind("private")
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_templates(&self) -> anyhow::Result<Vec<WorkflowTemplate>> {
        let rows = sqlx::query(
            "select id, name, saved, visibility from workflows order by created_at asc",
        )
        .fetch_all(&self.pool)
        .await?;

        let items = rows
            .into_iter()
            .map(|row| {
                let visibility = match row.get::<String, _>("visibility").as_str() {
                    "private" => WorkflowVisibility::Private,
                    "shared" => WorkflowVisibility::Shared,
                    other => anyhow::bail!("unknown workflow visibility: {other}"),
                };

                Ok(WorkflowTemplate {
                    id: row.get("id"),
                    name: row.get("name"),
                    saved: row.get::<i64, _>("saved") != 0,
                    visibility,
                })
            })
            .collect::<anyhow::Result<Vec<_>>>()?;

        Ok(items)
    }
}
