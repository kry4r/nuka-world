use nuka_domain::workflow::{
    WorkflowInputDefinition, WorkflowInputKind, WorkflowTemplate, WorkflowVisibility,
};
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

        let mut items = Vec::with_capacity(rows.len());
        for row in rows {
            let id: String = row.get("id");
            let visibility = match row.get::<String, _>("visibility").as_str() {
                "private" => WorkflowVisibility::Private,
                "shared" => WorkflowVisibility::Shared,
                other => anyhow::bail!("unknown workflow visibility: {other}"),
            };

            items.push(WorkflowTemplate {
                id: id.clone(),
                name: row.get("name"),
                saved: row.get::<i64, _>("saved") != 0,
                visibility,
                description: String::new(),
                inputs: self.list_inputs(&id).await?,
            });
        }

        Ok(items)
    }

    async fn list_inputs(&self, workflow_id: &str) -> anyhow::Result<Vec<WorkflowInputDefinition>> {
        let rows = sqlx::query(
            "select id, label, kind, required, placeholder from workflow_inputs where workflow_id = ?1 order by rowid asc",
        )
        .bind(workflow_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|row| {
                let kind = match row.get::<String, _>("kind").as_str() {
                    "text" => WorkflowInputKind::Text,
                    "long_text" => WorkflowInputKind::LongText,
                    "json" => WorkflowInputKind::Json,
                    other => anyhow::bail!("unknown workflow input kind: {other}"),
                };

                Ok(WorkflowInputDefinition {
                    id: row.get("id"),
                    label: row.get("label"),
                    kind,
                    required: row.get::<i64, _>("required") != 0,
                    placeholder: row.get("placeholder"),
                })
            })
            .collect()
    }
}
