create table if not exists workflows (
  id text primary key,
  name text not null,
  saved integer not null,
  visibility text not null default 'private',
  created_at text not null
);

create table if not exists workflow_inputs (
  id text primary key,
  workflow_id text not null,
  label text not null,
  kind text not null,
  required integer not null default 0,
  placeholder text
);

create table if not exists settings (
  id integer primary key check (id = 1),
  default_provider_id text,
  active_workflow_id text,
  appearance_theme text not null default 'system',
  close_to_tray integer not null default 1
);

create table if not exists providers (
  id text primary key,
  name text not null,
  kind text not null,
  base_url text not null,
  token text not null default '',
  model text not null,
  enabled integer not null,
  secret_ref text,
  secret_present integer not null default 0,
  secret_updated_at text,
  created_at text not null,
  updated_at text not null
);

create table if not exists agents (
  id text primary key,
  name text not null,
  description text not null,
  system_prompt text not null,
  provider_id text,
  knowledge_collection_ids text not null default '',
  memory_scope_ids text not null default '',
  created_at text not null,
  updated_at text not null
);

create table if not exists agent_tool_bindings (
  agent_id text not null,
  tool_id text not null,
  allowed integer not null,
  adapter_kind text not null default 'mcp',
  purpose text not null default '',
  cost_class text not null default 'low',
  primary key (agent_id, tool_id)
);

create table if not exists knowledge_collections (
  id text primary key,
  name text not null,
  description text not null,
  engine text not null,
  supported_extensions text not null default '',
  created_at text not null,
  updated_at text not null
);

create table if not exists knowledge_connectors (
  id text primary key,
  collection_id text not null,
  kind text not null,
  path text not null,
  enabled integer not null,
  created_at text not null
);

create table if not exists knowledge_index_jobs (
  id text primary key,
  collection_id text not null,
  status text not null,
  detail text,
  created_at text not null
);

create table if not exists chat_sessions (
  id text primary key,
  title text not null,
  provider_id text,
  route_json text,
  workflow_id text,
  branch_root_session_id text,
  branch_parent_session_id text,
  branch_source_snapshot_id text,
  branch_anchor_message_id text,
  message_count integer not null default 0,
  created_at text not null
);

create table if not exists chat_messages (
  id text primary key,
  session_id text not null,
  role text not null,
  content text not null,
  created_at text not null
);

create table if not exists chat_session_snapshots (
  id text primary key,
  session_id text not null references chat_sessions(id) on delete cascade,
  anchor_message_id text not null,
  title text not null,
  message_count integer not null,
  created_at text not null
);

create table if not exists memory_scopes (
  id text primary key,
  name text not null,
  workflow_id text,
  session_id text,
  agent_id text,
  created_at text not null
);

create table if not exists memory_nodes (
  id text primary key,
  kind text not null,
  title text not null,
  body text,
  trace_type text not null default 'semantic',
  consolidation_state text not null default 'none',
  created_at text not null,
  updated_at text not null
);

create table if not exists memory_edges (
  id text primary key,
  source_id text not null references memory_nodes(id) on delete cascade,
  target_id text not null references memory_nodes(id) on delete cascade,
  relation text not null,
  created_at text not null
);

create table if not exists memory_candidates (
  id text primary key,
  node_id text not null references memory_nodes(id) on delete cascade,
  title text not null,
  surface text not null,
  owner_id text not null,
  suggested_schema_id text,
  confidence real not null default 0,
  reason text not null default '',
  status text not null default 'pending',
  created_at text not null,
  reviewed_at text
);

create table if not exists memory_candidate_evidence (
  id text primary key,
  candidate_id text not null references memory_candidates(id) on delete cascade,
  detail text not null,
  created_at text not null
);

create table if not exists memory_snapshots (
  id text primary key,
  node_id text not null references memory_nodes(id) on delete cascade,
  title text not null,
  body text,
  trace_type text not null,
  created_at text not null
);

create table if not exists memory_review_actions (
  id text primary key,
  candidate_id text not null references memory_candidates(id) on delete cascade,
  node_id text not null references memory_nodes(id) on delete cascade,
  decision text not null,
  created_at text not null
);

create table if not exists runtime_state_entries (
  state_key text primary key,
  state_value text not null,
  updated_at text not null
);

create table if not exists teams (
  id text primary key,
  name text not null,
  goal text not null,
  summary text not null,
  prompt_constraints text not null default '',
  permission_policy text not null default '',
  success_criteria text not null,
  coordination_policy text not null,
  status text not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists team_agents (
  id text primary key,
  team_id text not null,
  agent_id text,
  enabled integer not null default 1,
  name text not null,
  role text not null,
  responsibility text not null,
  system_prompt text not null,
  tool_bindings_json text not null,
  tool_use_policy_json text not null,
  order_hint integer not null,
  prompt_override text,
  permission_override_json text not null default '{}',
  created_at text not null,
  updated_at text not null
);

create table if not exists team_runs (
  id text primary key,
  team_id text not null,
  title text not null,
  goal text not null,
  status text not null,
  current_phase text not null,
  lead_agent_id text,
  route_json text,
  branch_root_run_id text,
  branch_parent_run_id text,
  branch_source_snapshot_id text,
  branch_anchor_event_id text,
  charter_json text not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists team_run_agents (
  id text primary key,
  run_id text not null,
  source_agent_id text,
  source_team_assignment_id text,
  source_team_agent_id text,
  name text not null,
  role text not null,
  responsibility text not null,
  system_prompt text not null,
  tool_bindings_json text not null,
  tool_use_policy_json text not null,
  status text not null,
  current_work text not null,
  last_tool_activity text,
  joined_at text not null
);

create table if not exists team_run_events (
  id text primary key,
  run_id text not null,
  kind text not null,
  agent_id text,
  title text not null,
  content text not null,
  status text,
  tool_name text,
  tool_call_id text,
  tool_target text,
  sequence integer not null,
  created_at text not null
);

create table if not exists team_run_snapshots (
  id text primary key,
  run_id text not null references team_runs(id) on delete cascade,
  anchor_event_id text not null,
  title text not null,
  event_count integer not null,
  created_at text not null
);
