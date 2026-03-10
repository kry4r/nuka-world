pub async fn run(pool: &sqlx::SqlitePool) -> anyhow::Result<()> {
    sqlx::query("pragma foreign_keys = on")
        .execute(pool)
        .await?;

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

    let has_memory_trace_type: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('memory_nodes') where name = 'trace_type'",
    )
    .fetch_one(pool)
    .await?;

    if has_memory_trace_type == 0 {
        sqlx::query(
            "alter table memory_nodes add column trace_type text not null default 'semantic'",
        )
        .execute(pool)
        .await?;
    }

    let has_memory_consolidation_state: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('memory_nodes') where name = 'consolidation_state'",
    )
    .fetch_one(pool)
    .await?;

    if has_memory_consolidation_state == 0 {
        sqlx::query(
            "alter table memory_nodes add column consolidation_state text not null default 'none'",
        )
        .execute(pool)
        .await?;
    }

    sqlx::query(
        "create unique index if not exists memory_edges_relation_idx on memory_edges(source_id, target_id, relation)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "create index if not exists memory_candidates_pending_idx on memory_candidates(status, surface, owner_id, created_at)",
    )
    .execute(pool)
    .await?;

    Ok(())
}
