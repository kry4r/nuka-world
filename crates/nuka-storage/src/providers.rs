use nuka_domain::provider::{ProviderConfig, ProviderKind};
use sqlx::Row;

pub struct ProviderRepository {
    pool: sqlx::SqlitePool,
}

impl ProviderRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert(&self, provider: ProviderConfig) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            insert into providers (id, name, kind, base_url, token, model, enabled, created_at, updated_at)
            values (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), datetime('now'))
            on conflict(id) do update set
              name = excluded.name,
              kind = excluded.kind,
              base_url = excluded.base_url,
              token = excluded.token,
              model = excluded.model,
              enabled = excluded.enabled,
              updated_at = datetime('now')
            "#,
        )
        .bind(provider.id)
        .bind(provider.name)
        .bind(kind_as_str(&provider.kind))
        .bind(provider.base_url)
        .bind(provider.token)
        .bind(provider.model)
        .bind(provider.enabled as i64)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list(&self) -> anyhow::Result<Vec<ProviderConfig>> {
        let rows = sqlx::query(
            "select id, name, kind, base_url, token, model, enabled from providers order by created_at asc",
        )
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(map_provider).collect()
    }

    pub async fn delete(&self, provider_id: &str) -> anyhow::Result<()> {
        sqlx::query("delete from providers where id = ?1")
            .bind(provider_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }
}

fn map_provider(row: sqlx::sqlite::SqliteRow) -> anyhow::Result<ProviderConfig> {
    Ok(ProviderConfig {
        id: row.get("id"),
        name: row.get("name"),
        kind: parse_kind(&row.get::<String, _>("kind"))?,
        base_url: row.get("base_url"),
        token: row.get("token"),
        model: row.get("model"),
        enabled: row.get::<i64, _>("enabled") != 0,
    })
}

fn kind_as_str(kind: &ProviderKind) -> &'static str {
    match kind {
        ProviderKind::OpenAiCompatible => "openai_compatible",
    }
}

fn parse_kind(kind: &str) -> anyhow::Result<ProviderKind> {
    match kind {
        "openai_compatible" => Ok(ProviderKind::OpenAiCompatible),
        other => anyhow::bail!("unknown provider kind: {other}"),
    }
}
