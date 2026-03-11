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
        r#"
        insert or ignore into memory_scopes (id, name, workflow_id, session_id, agent_id, created_at)
        values ('world', 'World', null, null, null, datetime('now'))
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        create table if not exists memory_node_scopes (
          node_id text primary key references memory_nodes(id) on delete cascade,
          scope_id text not null references memory_scopes(id) on delete cascade,
          created_at text not null
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        insert or ignore into memory_node_scopes (node_id, scope_id, created_at)
        select id, 'world', datetime('now') from memory_nodes
        "#,
    )
    .execute(pool)
    .await?;

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

    sqlx::query(
        "create index if not exists memory_node_scopes_scope_idx on memory_node_scopes(scope_id, node_id)",
    )
    .execute(pool)
    .await?;

    Ok(())
}
