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
  token text not null,
  model text not null,
  enabled integer not null,
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
  workflow_id text,
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

create table if not exists memory_scopes (
  id text primary key,
  name text not null,
  workflow_id text,
  session_id text,
  agent_id text,
  created_at text not null
);

create table if not exists runtime_state_entries (
  state_key text primary key,
  state_value text not null,
  updated_at text not null
);
