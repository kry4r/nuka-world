use sqlx::Row;

pub struct RuntimeStateRepository {
    pool: sqlx::SqlitePool,
}

impl RuntimeStateRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn put(&self, key: &str, value: &str) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            insert into runtime_state_entries (state_key, state_value, updated_at)
            values (?1, ?2, datetime('now'))
            on conflict(state_key) do update set
              state_value = excluded.state_value,
              updated_at = datetime('now')
            "#,
        )
        .bind(key)
        .bind(value)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get(&self, key: &str) -> anyhow::Result<Option<String>> {
        let row = sqlx::query("select state_value from runtime_state_entries where state_key = ?1")
            .bind(key)
            .fetch_optional(&self.pool)
            .await?;

        Ok(row.map(|row| row.get("state_value")))
    }
}
