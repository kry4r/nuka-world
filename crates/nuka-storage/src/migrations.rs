pub async fn run(pool: &sqlx::SqlitePool) -> anyhow::Result<()> {
    sqlx::query(include_str!("../migrations/0001_initial.sql"))
        .execute(pool)
        .await?;

    let has_visibility: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('workflows') where name = 'visibility'",
    )
    .fetch_one(pool)
    .await?;

    if has_visibility == 0 {
        sqlx::query(
            "alter table workflows add column visibility text not null default 'private'",
        )
        .execute(pool)
        .await?;
    }

    Ok(())
}
