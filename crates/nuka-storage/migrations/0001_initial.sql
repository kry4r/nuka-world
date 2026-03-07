create table if not exists workflows (
  id text primary key,
  name text not null,
  saved integer not null,
  visibility text not null default 'private',
  created_at text not null
);
