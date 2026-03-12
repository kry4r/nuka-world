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
        sqlx::query("alter table workflows add column visibility text not null default 'private'")
            .execute(pool)
            .await?;
    }

    let has_agent_binding_adapter_kind: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('agent_tool_bindings') where name = 'adapter_kind'",
    )
    .fetch_one(pool)
    .await?;

    if has_agent_binding_adapter_kind == 0 {
        sqlx::query(
            "alter table agent_tool_bindings add column adapter_kind text not null default 'mcp'",
        )
        .execute(pool)
        .await?;
    }

    let has_agent_archetype_json: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('agents') where name = 'archetype_json'",
    )
    .fetch_one(pool)
    .await?;

    if has_agent_archetype_json == 0 {
        sqlx::query("alter table agents add column archetype_json text not null default ''")
            .execute(pool)
            .await?;
    }

    let has_agent_binding_purpose: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('agent_tool_bindings') where name = 'purpose'",
    )
    .fetch_one(pool)
    .await?;

    if has_agent_binding_purpose == 0 {
        sqlx::query("alter table agent_tool_bindings add column purpose text not null default ''")
            .execute(pool)
            .await?;
    }

    let has_agent_binding_cost_class: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('agent_tool_bindings') where name = 'cost_class'",
    )
    .fetch_one(pool)
    .await?;

    if has_agent_binding_cost_class == 0 {
        sqlx::query(
            "alter table agent_tool_bindings add column cost_class text not null default 'low'",
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

    let has_team_prompt_constraints: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('teams') where name = 'prompt_constraints'",
    )
    .fetch_one(pool)
    .await?;

    if has_team_prompt_constraints == 0 {
        sqlx::query("alter table teams add column prompt_constraints text not null default ''")
            .execute(pool)
            .await?;
    }

    let has_team_permission_policy: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('teams') where name = 'permission_policy'",
    )
    .fetch_one(pool)
    .await?;

    if has_team_permission_policy == 0 {
        sqlx::query("alter table teams add column permission_policy text not null default ''")
            .execute(pool)
            .await?;
    }

    let has_provider_secret_ref: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('providers') where name = 'secret_ref'",
    )
    .fetch_one(pool)
    .await?;

    if has_provider_secret_ref == 0 {
        sqlx::query("alter table providers add column secret_ref text")
            .execute(pool)
            .await?;
    }

    let has_provider_secret_present: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('providers') where name = 'secret_present'",
    )
    .fetch_one(pool)
    .await?;

    if has_provider_secret_present == 0 {
        sqlx::query("alter table providers add column secret_present integer not null default 0")
            .execute(pool)
            .await?;
    }

    let has_provider_secret_updated_at: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('providers') where name = 'secret_updated_at'",
    )
    .fetch_one(pool)
    .await?;

    if has_provider_secret_updated_at == 0 {
        sqlx::query("alter table providers add column secret_updated_at text")
            .execute(pool)
            .await?;
    }

    let has_team_agent_id: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('team_agents') where name = 'agent_id'",
    )
    .fetch_one(pool)
    .await?;

    if has_team_agent_id == 0 {
        sqlx::query("alter table team_agents add column agent_id text")
            .execute(pool)
            .await?;
    }

    let has_team_agent_enabled: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('team_agents') where name = 'enabled'",
    )
    .fetch_one(pool)
    .await?;

    if has_team_agent_enabled == 0 {
        sqlx::query("alter table team_agents add column enabled integer not null default 1")
            .execute(pool)
            .await?;
    }

    let has_team_agent_prompt_override: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('team_agents') where name = 'prompt_override'",
    )
    .fetch_one(pool)
    .await?;

    if has_team_agent_prompt_override == 0 {
        sqlx::query("alter table team_agents add column prompt_override text")
            .execute(pool)
            .await?;
    }

    let has_team_agent_permission_override: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('team_agents') where name = 'permission_override_json'",
    )
    .fetch_one(pool)
    .await?;

    if has_team_agent_permission_override == 0 {
        sqlx::query(
            "alter table team_agents add column permission_override_json text not null default '{}'",
        )
        .execute(pool)
        .await?;
    }

    let has_team_run_source_agent_id: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('team_run_agents') where name = 'source_agent_id'",
    )
    .fetch_one(pool)
    .await?;

    if has_team_run_source_agent_id == 0 {
        sqlx::query("alter table team_run_agents add column source_agent_id text")
            .execute(pool)
            .await?;
    }

    let has_team_run_source_assignment_id: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('team_run_agents') where name = 'source_team_assignment_id'",
    )
    .fetch_one(pool)
    .await?;

    if has_team_run_source_assignment_id == 0 {
        sqlx::query("alter table team_run_agents add column source_team_assignment_id text")
            .execute(pool)
            .await?;
    }

    let has_chat_root_session_id: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('chat_sessions') where name = 'root_session_id'",
    )
    .fetch_one(pool)
    .await?;

    if has_chat_root_session_id == 0 {
        sqlx::query("alter table chat_sessions add column root_session_id text")
            .execute(pool)
            .await?;
    }

    let has_chat_parent_session_id: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('chat_sessions') where name = 'parent_session_id'",
    )
    .fetch_one(pool)
    .await?;

    if has_chat_parent_session_id == 0 {
        sqlx::query("alter table chat_sessions add column parent_session_id text")
            .execute(pool)
            .await?;
    }

    let has_chat_branch_snapshot_id: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('chat_sessions') where name = 'branch_snapshot_id'",
    )
    .fetch_one(pool)
    .await?;

    if has_chat_branch_snapshot_id == 0 {
        sqlx::query("alter table chat_sessions add column branch_snapshot_id text")
            .execute(pool)
            .await?;
    }

    let has_chat_branched_from_message_id: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('chat_sessions') where name = 'branched_from_message_id'",
    )
    .fetch_one(pool)
    .await?;

    if has_chat_branched_from_message_id == 0 {
        sqlx::query("alter table chat_sessions add column branched_from_message_id text")
            .execute(pool)
            .await?;
    }

    let has_chat_branch_depth: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('chat_sessions') where name = 'branch_depth'",
    )
    .fetch_one(pool)
    .await?;

    if has_chat_branch_depth == 0 {
        sqlx::query("alter table chat_sessions add column branch_depth integer not null default 0")
            .execute(pool)
            .await?;
    }

    let has_chat_route_json: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('chat_sessions') where name = 'route_json'",
    )
    .fetch_one(pool)
    .await?;

    if has_chat_route_json == 0 {
        sqlx::query("alter table chat_sessions add column route_json text not null default ''")
            .execute(pool)
            .await?;
    }

    sqlx::query(
        r#"
        update chat_sessions
        set root_session_id = id
        where root_session_id is null or root_session_id = ''
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        create table if not exists chat_session_snapshots (
          id text primary key,
          session_id text not null,
          message_id text not null,
          message_index integer not null,
          title text not null,
          message_role text not null,
          message_excerpt text not null,
          created_at text not null
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        create table if not exists chat_session_compactions (
          id text primary key,
          session_id text not null,
          message_index integer not null,
          source_message_count integer not null,
          summary text not null,
          created_at text not null
        )
        "#,
    )
    .execute(pool)
    .await?;

    let has_team_root_run_id: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('team_runs') where name = 'root_run_id'",
    )
    .fetch_one(pool)
    .await?;

    if has_team_root_run_id == 0 {
        sqlx::query("alter table team_runs add column root_run_id text")
            .execute(pool)
            .await?;
    }

    let has_team_parent_run_id: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('team_runs') where name = 'parent_run_id'",
    )
    .fetch_one(pool)
    .await?;

    if has_team_parent_run_id == 0 {
        sqlx::query("alter table team_runs add column parent_run_id text")
            .execute(pool)
            .await?;
    }

    let has_team_branch_snapshot_id: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('team_runs') where name = 'branch_snapshot_id'",
    )
    .fetch_one(pool)
    .await?;

    if has_team_branch_snapshot_id == 0 {
        sqlx::query("alter table team_runs add column branch_snapshot_id text")
            .execute(pool)
            .await?;
    }

    let has_team_branched_from_event_id: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('team_runs') where name = 'branched_from_event_id'",
    )
    .fetch_one(pool)
    .await?;

    if has_team_branched_from_event_id == 0 {
        sqlx::query("alter table team_runs add column branched_from_event_id text")
            .execute(pool)
            .await?;
    }

    let has_team_branch_depth: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('team_runs') where name = 'branch_depth'",
    )
    .fetch_one(pool)
    .await?;

    if has_team_branch_depth == 0 {
        sqlx::query("alter table team_runs add column branch_depth integer not null default 0")
            .execute(pool)
            .await?;
    }

    let has_team_route_json: i64 = sqlx::query_scalar(
        "select count(*) from pragma_table_info('team_runs') where name = 'route_json'",
    )
    .fetch_one(pool)
    .await?;

    if has_team_route_json == 0 {
        sqlx::query("alter table team_runs add column route_json text not null default ''")
            .execute(pool)
            .await?;
    }

    sqlx::query(
        r#"
        update team_runs
        set root_run_id = id
        where root_run_id is null or root_run_id = ''
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        create table if not exists team_run_snapshots (
          id text primary key,
          run_id text not null,
          event_id text not null,
          event_sequence integer not null,
          title text not null,
          event_kind text not null,
          event_excerpt text not null,
          created_at text not null
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        create table if not exists team_run_compactions (
          id text primary key,
          run_id text not null,
          event_sequence integer not null,
          source_event_count integer not null,
          summary text not null,
          created_at text not null
        )
        "#,
    )
    .execute(pool)
    .await?;

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

    sqlx::query(
        "create index if not exists chat_sessions_root_updated_idx on chat_sessions(root_session_id, created_at)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "create index if not exists chat_session_snapshots_session_message_idx on chat_session_snapshots(session_id, message_index)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "create index if not exists chat_session_compactions_session_message_idx on chat_session_compactions(session_id, message_index)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "create index if not exists team_runs_root_updated_idx on team_runs(root_run_id, updated_at)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "create index if not exists team_run_snapshots_run_sequence_idx on team_run_snapshots(run_id, event_sequence)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "create index if not exists team_run_compactions_run_sequence_idx on team_run_compactions(run_id, event_sequence)",
    )
    .execute(pool)
    .await?;

    Ok(())
}
