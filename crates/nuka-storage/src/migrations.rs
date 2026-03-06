pub async fn run(pool: &sqlx::SqlitePool) -> anyhow::Result<()> {
    sqlx::query(include_str!("../migrations/0001_initial.sql"))
        .execute(pool)
        .await?;

    Ok(())
}
