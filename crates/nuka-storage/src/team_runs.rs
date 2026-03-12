use nuka_domain::team::{TeamRun, TeamRunAgent, TeamRunAgentStatus, TeamRunEvent, TeamRunStatus};
use serde::{de::DeserializeOwned, Serialize};
use sqlx::Row;
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamRunLineageRecord {
    pub root_run_id: String,
    pub parent_run_id: Option<String>,
    pub branch_snapshot_id: Option<String>,
    pub branched_from_event_id: Option<String>,
    pub branch_depth: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamRunRecord {
    pub run: TeamRun,
    pub lineage: TeamRunLineageRecord,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamRunSnapshotRecord {
    pub id: String,
    pub run_id: String,
    pub event_id: String,
    pub event_sequence: i64,
    pub title: String,
    pub event_kind: String,
    pub event_excerpt: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamRunBranchRecord {
    pub run: TeamRun,
    pub lineage: TeamRunLineageRecord,
    pub snapshots: Vec<TeamRunSnapshotRecord>,
}

pub struct TeamRunRepository {
    pool: sqlx::SqlitePool,
}

impl TeamRunRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create_run(&self, run: TeamRun) -> anyhow::Result<()> {
        self.save_run_with_lineage(run, default_lineage_for_run).await
    }

    pub async fn save_run(&self, run: TeamRun) -> anyhow::Result<()> {
        let lineage = self
            .load_run_lineage(&run.id)
            .await?
            .unwrap_or_else(|| default_lineage_for_run(&run.id));
        self.save_run_with_lineage(run, |_| lineage).await
    }

    async fn save_run_with_lineage<F>(&self, run: TeamRun, lineage_factory: F) -> anyhow::Result<()>
    where
        F: FnOnce(&str) -> TeamRunLineageRecord,
    {
        let mut tx = self.pool.begin().await?;
        let lineage = lineage_factory(&run.id);

        save_run_with_lineage_in_tx(&mut tx, run, &lineage).await?;

        tx.commit().await?;
        Ok(())
    }

    pub async fn load_run(&self, run_id: &str) -> anyhow::Result<Option<TeamRun>> {
        Ok(self.load_run_record(run_id).await?.map(|record| record.run))
    }

    pub async fn load_run_record(&self, run_id: &str) -> anyhow::Result<Option<TeamRunRecord>> {
        let row = sqlx::query(
            r#"
            select
              id,
              team_id,
              title,
              goal,
              status,
              current_phase,
              lead_agent_id,
              charter_json,
              created_at,
              updated_at,
              root_run_id,
              parent_run_id,
              branch_snapshot_id,
              branched_from_event_id,
              branch_depth
            from team_runs
            where id = ?1
            limit 1
            "#,
        )
        .bind(run_id)
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(row) => {
                let id: String = row.get("id");
                Ok(Some(TeamRunRecord {
                    run: TeamRun {
                        id: id.clone(),
                        team_id: row.get("team_id"),
                        title: row.get("title"),
                        goal: row.get("goal"),
                        status: parse_team_run_status(&row.get::<String, _>("status"))?,
                        current_phase: row.get("current_phase"),
                        lead_agent_id: row.get("lead_agent_id"),
                        charter: decode_json(&row.get::<String, _>("charter_json"))?,
                        created_at: row.get("created_at"),
                        updated_at: row.get("updated_at"),
                        agents: self.load_agents(&id).await?,
                        events: self.load_events(&id).await?,
                    },
                    lineage: map_run_lineage(&row, &id)?,
                }))
            }
            None => Ok(None),
        }
    }

    pub async fn list_runs(&self) -> anyhow::Result<Vec<TeamRun>> {
        Ok(self
            .list_run_records()
            .await?
            .into_iter()
            .map(|record| record.run)
            .collect())
    }

    pub async fn list_run_records(&self) -> anyhow::Result<Vec<TeamRunRecord>> {
        let rows = sqlx::query(
            r#"
            select
              id, team_id, title, goal, status, current_phase, lead_agent_id,
              charter_json, created_at, updated_at,
              root_run_id, parent_run_id, branch_snapshot_id, branched_from_event_id, branch_depth
            from team_runs
            order by updated_at desc, created_at desc
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut runs = Vec::with_capacity(rows.len());
        for row in rows {
            let id: String = row.get("id");
            runs.push(TeamRunRecord {
                run: TeamRun {
                    id: id.clone(),
                    team_id: row.get("team_id"),
                    title: row.get("title"),
                    goal: row.get("goal"),
                    status: parse_team_run_status(&row.get::<String, _>("status"))?,
                    current_phase: row.get("current_phase"),
                    lead_agent_id: row.get("lead_agent_id"),
                    charter: decode_json(&row.get::<String, _>("charter_json"))?,
                    created_at: row.get("created_at"),
                    updated_at: row.get("updated_at"),
                    agents: self.load_agents(&id).await?,
                    events: self.load_events(&id).await?,
                },
                lineage: map_run_lineage(&row, &id)?,
            });
        }

        Ok(runs)
    }

    pub async fn list_run_snapshots(
        &self,
        run_id: &str,
    ) -> anyhow::Result<Vec<TeamRunSnapshotRecord>> {
        let rows = sqlx::query(
            r#"
            select
              id,
              run_id,
              event_id,
              event_sequence,
              title,
              event_kind,
              event_excerpt,
              created_at
            from team_run_snapshots
            where run_id = ?1
            order by event_sequence asc, created_at asc, rowid asc
            "#,
        )
        .bind(run_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(map_run_snapshot).collect())
    }

    pub async fn create_branch_from_event(
        &self,
        source_run_id: &str,
        event_id: &str,
        branch_title: &str,
    ) -> anyhow::Result<TeamRunBranchRecord> {
        let source = self
            .load_run_record(source_run_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("unknown team run: {source_run_id}"))?;
        let anchor_index = source
            .run
            .events
            .iter()
            .position(|event| event.id == event_id)
            .ok_or_else(|| anyhow::anyhow!("unknown team run event: {event_id}"))?;
        let anchor_event = &source.run.events[anchor_index];
        let snapshot_id = uuid::Uuid::new_v4().to_string();
        let child_run_id = uuid::Uuid::new_v4().to_string();
        let mut agent_id_map = HashMap::new();
        let cloned_agents = source
            .run
            .agents
            .iter()
            .cloned()
            .map(|mut agent| {
                let previous_id = agent.id.clone();
                agent.id = uuid::Uuid::new_v4().to_string();
                agent.run_id = child_run_id.clone();
                agent_id_map.insert(previous_id, agent.id.clone());
                agent
            })
            .collect::<Vec<_>>();
        let cloned_events = source
            .run
            .events
            .iter()
            .take(anchor_index + 1)
            .cloned()
            .map(|mut event| {
                event.id = uuid::Uuid::new_v4().to_string();
                event.run_id = child_run_id.clone();
                event.agent_id = event
                    .agent_id
                    .as_ref()
                    .and_then(|agent_id| agent_id_map.get(agent_id).cloned());
                event
            })
            .collect::<Vec<_>>();
        let cloned_run = TeamRun {
            id: child_run_id.clone(),
            team_id: source.run.team_id.clone(),
            title: branch_title.to_string(),
            goal: source.run.goal.clone(),
            status: source.run.status.clone(),
            current_phase: source.run.current_phase.clone(),
            lead_agent_id: source
                .run
                .lead_agent_id
                .as_ref()
                .and_then(|agent_id| agent_id_map.get(agent_id).cloned()),
            charter: source.run.charter.clone(),
            created_at: String::new(),
            updated_at: String::new(),
            agents: cloned_agents,
            events: cloned_events,
        };
        let lineage = TeamRunLineageRecord {
            root_run_id: source.lineage.root_run_id.clone(),
            parent_run_id: Some(source.run.id.clone()),
            branch_snapshot_id: Some(snapshot_id.clone()),
            branched_from_event_id: Some(anchor_event.id.clone()),
            branch_depth: source.lineage.branch_depth + 1,
        };
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            insert into team_run_snapshots (
              id, run_id, event_id, event_sequence, title, event_kind, event_excerpt, created_at
            )
            values (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
            "#,
        )
        .bind(&snapshot_id)
        .bind(source_run_id)
        .bind(&anchor_event.id)
        .bind(anchor_event.sequence)
        .bind(snapshot_title(branch_title, anchor_event.sequence))
        .bind(&anchor_event.kind)
        .bind(event_excerpt(&anchor_event.content))
        .execute(&mut *tx)
        .await?;

        save_run_with_lineage_in_tx(&mut tx, cloned_run, &lineage).await?;
        tx.commit().await?;

        let run = self
            .load_run_record(&child_run_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("branched team run disappeared after save"))?;
        let snapshot = self
            .list_run_snapshots(source_run_id)
            .await?
            .into_iter()
            .find(|record| record.id == snapshot_id)
            .ok_or_else(|| anyhow::anyhow!("team run snapshot disappeared after save"))?;

        Ok(TeamRunBranchRecord {
            run: run.run,
            lineage: run.lineage,
            snapshots: vec![snapshot],
        })
    }

    async fn load_agents(&self, run_id: &str) -> anyhow::Result<Vec<TeamRunAgent>> {
        let rows = sqlx::query(
            r#"
            select
              id, run_id, source_agent_id, source_team_assignment_id, source_team_agent_id,
              name, role, responsibility, system_prompt, tool_bindings_json,
              tool_use_policy_json, status, current_work, last_tool_activity, joined_at
            from team_run_agents
            where run_id = ?1
            order by joined_at asc, rowid asc
            "#,
        )
        .bind(run_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|row| {
                Ok(TeamRunAgent {
                    id: row.get("id"),
                    run_id: row.get("run_id"),
                    source_agent_id: row.get("source_agent_id"),
                    source_team_assignment_id: row.get("source_team_assignment_id"),
                    source_team_agent_id: row.get("source_team_agent_id"),
                    name: row.get("name"),
                    role: row.get("role"),
                    responsibility: row.get("responsibility"),
                    system_prompt: row.get("system_prompt"),
                    tool_bindings: decode_json(&row.get::<String, _>("tool_bindings_json"))?,
                    tool_use_policy: decode_json(&row.get::<String, _>("tool_use_policy_json"))?,
                    status: parse_team_run_agent_status(&row.get::<String, _>("status"))?,
                    current_work: row.get("current_work"),
                    last_tool_activity: row.get("last_tool_activity"),
                    joined_at: row.get("joined_at"),
                })
            })
            .collect()
    }

    async fn load_events(&self, run_id: &str) -> anyhow::Result<Vec<TeamRunEvent>> {
        let rows = sqlx::query(
            r#"
            select
              id, run_id, kind, agent_id, title, content, status, tool_name,
              tool_call_id, tool_target, sequence, created_at
            from team_run_events
            where run_id = ?1
            order by sequence asc, created_at asc, rowid asc
            "#,
        )
        .bind(run_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|row| {
                Ok(TeamRunEvent {
                    id: row.get("id"),
                    run_id: row.get("run_id"),
                    kind: row.get("kind"),
                    agent_id: row.get("agent_id"),
                    title: row.get("title"),
                    content: row.get("content"),
                    status: row.get("status"),
                    tool_name: row.get("tool_name"),
                    tool_call_id: row.get("tool_call_id"),
                    tool_target: row.get("tool_target"),
                    sequence: row.get("sequence"),
                    created_at: row.get("created_at"),
                })
            })
            .collect()
    }

    async fn load_run_lineage(&self, run_id: &str) -> anyhow::Result<Option<TeamRunLineageRecord>> {
        let row = sqlx::query(
            r#"
            select id, root_run_id, parent_run_id, branch_snapshot_id, branched_from_event_id, branch_depth
            from team_runs
            where id = ?1
            limit 1
            "#,
        )
        .bind(run_id)
        .fetch_optional(&self.pool)
        .await?;

        row.map(|row| map_run_lineage(&row, run_id)).transpose()
    }
}

async fn save_run_with_lineage_in_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    run: TeamRun,
    lineage: &TeamRunLineageRecord,
) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        insert into team_runs (
          id, team_id, title, goal, status, current_phase, lead_agent_id,
          charter_json, created_at, updated_at, root_run_id, parent_run_id,
          branch_snapshot_id, branched_from_event_id, branch_depth
        )
        values (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
          coalesce(nullif(?9, ''), datetime('now')),
          coalesce(nullif(?10, ''), datetime('now')),
          ?11, ?12, ?13, ?14, ?15
        )
        on conflict(id) do update set
          title = excluded.title,
          goal = excluded.goal,
          status = excluded.status,
          current_phase = excluded.current_phase,
          lead_agent_id = excluded.lead_agent_id,
          charter_json = excluded.charter_json,
          updated_at = coalesce(nullif(excluded.updated_at, ''), datetime('now')),
          root_run_id = excluded.root_run_id,
          parent_run_id = excluded.parent_run_id,
          branch_snapshot_id = excluded.branch_snapshot_id,
          branched_from_event_id = excluded.branched_from_event_id,
          branch_depth = excluded.branch_depth
        "#,
    )
    .bind(run.id.clone())
    .bind(run.team_id.clone())
    .bind(run.title)
    .bind(run.goal)
    .bind(team_run_status_as_str(&run.status))
    .bind(run.current_phase)
    .bind(run.lead_agent_id.clone())
    .bind(encode_json(&run.charter)?)
    .bind(run.created_at)
    .bind(run.updated_at)
    .bind(&lineage.root_run_id)
    .bind(&lineage.parent_run_id)
    .bind(&lineage.branch_snapshot_id)
    .bind(&lineage.branched_from_event_id)
    .bind(lineage.branch_depth as i64)
    .execute(&mut **tx)
    .await?;

    sqlx::query("delete from team_run_agents where run_id = ?1")
        .bind(run.id.clone())
        .execute(&mut **tx)
        .await?;
    sqlx::query("delete from team_run_events where run_id = ?1")
        .bind(run.id.clone())
        .execute(&mut **tx)
        .await?;

    for agent in run.agents {
        sqlx::query(
            r#"
            insert into team_run_agents (
              id, run_id, source_agent_id, source_team_assignment_id, source_team_agent_id,
              name, role, responsibility, system_prompt, tool_bindings_json,
              tool_use_policy_json, status, current_work, last_tool_activity, joined_at
            )
            values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            "#,
        )
        .bind(agent.id)
        .bind(run.id.clone())
        .bind(agent.source_agent_id)
        .bind(agent.source_team_assignment_id)
        .bind(agent.source_team_agent_id)
        .bind(agent.name)
        .bind(agent.role)
        .bind(agent.responsibility)
        .bind(agent.system_prompt)
        .bind(encode_json(&agent.tool_bindings)?)
        .bind(encode_json(&agent.tool_use_policy)?)
        .bind(team_run_agent_status_as_str(&agent.status))
        .bind(agent.current_work)
        .bind(agent.last_tool_activity)
        .bind(agent.joined_at)
        .execute(&mut **tx)
        .await?;
    }

    for event in run.events {
        sqlx::query(
            r#"
            insert into team_run_events (
              id, run_id, kind, agent_id, title, content, status, tool_name,
              tool_call_id, tool_target, sequence, created_at
            )
            values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#,
        )
        .bind(event.id)
        .bind(run.id.clone())
        .bind(event.kind)
        .bind(event.agent_id)
        .bind(event.title)
        .bind(event.content)
        .bind(event.status)
        .bind(event.tool_name)
        .bind(event.tool_call_id)
        .bind(event.tool_target)
        .bind(event.sequence)
        .bind(event.created_at)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

fn default_lineage_for_run(run_id: &str) -> TeamRunLineageRecord {
    TeamRunLineageRecord {
        root_run_id: run_id.to_string(),
        parent_run_id: None,
        branch_snapshot_id: None,
        branched_from_event_id: None,
        branch_depth: 0,
    }
}

fn map_run_lineage(
    row: &sqlx::sqlite::SqliteRow,
    run_id: &str,
) -> anyhow::Result<TeamRunLineageRecord> {
    Ok(TeamRunLineageRecord {
        root_run_id: row
            .try_get::<Option<String>, _>("root_run_id")?
            .unwrap_or_else(|| run_id.to_string()),
        parent_run_id: row.try_get("parent_run_id")?,
        branch_snapshot_id: row.try_get("branch_snapshot_id")?,
        branched_from_event_id: row.try_get("branched_from_event_id")?,
        branch_depth: row.get::<i64, _>("branch_depth") as usize,
    })
}

fn map_run_snapshot(row: sqlx::sqlite::SqliteRow) -> TeamRunSnapshotRecord {
    TeamRunSnapshotRecord {
        id: row.get("id"),
        run_id: row.get("run_id"),
        event_id: row.get("event_id"),
        event_sequence: row.get("event_sequence"),
        title: row.get("title"),
        event_kind: row.get("event_kind"),
        event_excerpt: row.get("event_excerpt"),
        created_at: row.get("created_at"),
    }
}

fn team_run_status_as_str(status: &TeamRunStatus) -> &'static str {
    match status {
        TeamRunStatus::Active => "active",
        TeamRunStatus::WaitingForAgents => "waiting_for_agents",
        TeamRunStatus::WaitingForUser => "waiting_for_user",
        TeamRunStatus::BudgetPaused => "budget_paused",
        TeamRunStatus::Completed => "completed",
        TeamRunStatus::Failed => "failed",
    }
}

fn parse_team_run_status(status: &str) -> anyhow::Result<TeamRunStatus> {
    match status {
        "active" => Ok(TeamRunStatus::Active),
        "waiting_for_agents" => Ok(TeamRunStatus::WaitingForAgents),
        "waiting_for_user" => Ok(TeamRunStatus::WaitingForUser),
        "budget_paused" => Ok(TeamRunStatus::BudgetPaused),
        "completed" => Ok(TeamRunStatus::Completed),
        "failed" => Ok(TeamRunStatus::Failed),
        other => anyhow::bail!("unknown team run status: {other}"),
    }
}

fn team_run_agent_status_as_str(status: &TeamRunAgentStatus) -> &'static str {
    match status {
        TeamRunAgentStatus::Thinking => "thinking",
        TeamRunAgentStatus::Drafting => "drafting",
        TeamRunAgentStatus::Reviewing => "reviewing",
        TeamRunAgentStatus::Waiting => "waiting",
        TeamRunAgentStatus::Blocked => "blocked",
        TeamRunAgentStatus::Done => "done",
    }
}

fn parse_team_run_agent_status(status: &str) -> anyhow::Result<TeamRunAgentStatus> {
    match status {
        "thinking" => Ok(TeamRunAgentStatus::Thinking),
        "drafting" => Ok(TeamRunAgentStatus::Drafting),
        "reviewing" => Ok(TeamRunAgentStatus::Reviewing),
        "waiting" => Ok(TeamRunAgentStatus::Waiting),
        "blocked" => Ok(TeamRunAgentStatus::Blocked),
        "done" => Ok(TeamRunAgentStatus::Done),
        other => anyhow::bail!("unknown team run agent status: {other}"),
    }
}

fn encode_json<T: Serialize>(value: &T) -> anyhow::Result<String> {
    Ok(serde_json::to_string(value)?)
}

fn decode_json<T: DeserializeOwned>(value: &str) -> anyhow::Result<T> {
    Ok(serde_json::from_str(value)?)
}

fn snapshot_title(branch_title: &str, sequence: i64) -> String {
    format!("{branch_title} @ {sequence}")
}

fn event_excerpt(content: &str) -> String {
    content.chars().take(160).collect()
}

#[cfg(test)]
mod tests {
    use nuka_domain::{
        team::{RunCharter, TeamRun, TeamRunEvent, TeamRunStatus},
        tool::ToolUsePolicy,
    };

    async fn table_exists(db: &sqlx::SqlitePool, table: &str) -> bool {
        sqlx::query_scalar::<_, i64>(
            "select count(*) from sqlite_master where type = 'table' and name = ?1",
        )
        .bind(table)
        .fetch_one(db)
        .await
        .unwrap()
            > 0
    }

    async fn column_exists(db: &sqlx::SqlitePool, table: &str, column: &str) -> bool {
        sqlx::query_scalar::<_, i64>(
            "select count(*) from pragma_table_info(?1) where name = ?2",
        )
        .bind(table)
        .bind(column)
        .fetch_one(db)
        .await
        .unwrap()
            > 0
    }

    #[tokio::test]
    async fn team_run_repository_migrations_add_branching_tables_and_lineage_columns() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        assert!(table_exists(&db, "team_run_snapshots").await);
        assert!(column_exists(&db, "team_runs", "root_run_id").await);
        assert!(column_exists(&db, "team_runs", "parent_run_id").await);
        assert!(column_exists(&db, "team_runs", "branch_snapshot_id").await);
        assert!(column_exists(&db, "team_runs", "branched_from_event_id").await);
        assert!(column_exists(&db, "team_runs", "branch_depth").await);
    }

    #[tokio::test]
    async fn create_branch_from_event_clones_run_state_and_persists_snapshot_lineage() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = super::TeamRunRepository::new(db.clone());
        repo.create_run(TeamRun {
            id: "run-root".to_string(),
            team_id: "team-release".to_string(),
            title: "Release team run".to_string(),
            goal: "Ship the release".to_string(),
            status: TeamRunStatus::WaitingForUser,
            current_phase: "verification".to_string(),
            lead_agent_id: None,
            charter: RunCharter::default_for_goal("Ship the release"),
            created_at: "2026-03-12T00:00:00Z".to_string(),
            updated_at: "2026-03-12T00:00:00Z".to_string(),
            agents: vec![nuka_domain::team::TeamRunAgent {
                id: "run-agent-reviewer".to_string(),
                run_id: "run-root".to_string(),
                source_agent_id: Some("agent-reviewer".to_string()),
                source_team_assignment_id: Some("assign-reviewer".to_string()),
                source_team_agent_id: Some("team-agent-reviewer".to_string()),
                name: "Reviewer".to_string(),
                role: "Reviewer".to_string(),
                responsibility: "Check the release package".to_string(),
                system_prompt: "Review the release package carefully.".to_string(),
                tool_bindings: Vec::new(),
                tool_use_policy: ToolUsePolicy::default(),
                status: nuka_domain::team::TeamRunAgentStatus::Done,
                current_work: "Round complete".to_string(),
                last_tool_activity: None,
                joined_at: "2026-03-12T00:00:00Z".to_string(),
            }],
            events: vec![
                TeamRunEvent {
                    id: "event-1".to_string(),
                    run_id: "run-root".to_string(),
                    kind: "run_started".to_string(),
                    agent_id: None,
                    title: "Run started".to_string(),
                    content: "Release team run started".to_string(),
                    status: Some("completed".to_string()),
                    tool_name: None,
                    tool_call_id: None,
                    tool_target: None,
                    sequence: 1,
                    created_at: "2026-03-12T00:00:00Z".to_string(),
                },
                TeamRunEvent {
                    id: "event-2".to_string(),
                    run_id: "run-root".to_string(),
                    kind: "checkpoint_summary".to_string(),
                    agent_id: Some("run-agent-reviewer".to_string()),
                    title: "Checkpoint".to_string(),
                    content: "Verification needs one more pass".to_string(),
                    status: Some("completed".to_string()),
                    tool_name: None,
                    tool_call_id: None,
                    tool_target: None,
                    sequence: 2,
                    created_at: "2026-03-12T00:05:00Z".to_string(),
                },
                TeamRunEvent {
                    id: "event-3".to_string(),
                    run_id: "run-root".to_string(),
                    kind: "user_instruction".to_string(),
                    agent_id: None,
                    title: "Follow-up".to_string(),
                    content: "Also include rollback notes".to_string(),
                    status: Some("queued".to_string()),
                    tool_name: None,
                    tool_call_id: None,
                    tool_target: None,
                    sequence: 3,
                    created_at: "2026-03-12T00:10:00Z".to_string(),
                },
            ],
        })
        .await
        .unwrap();

        let branch = repo
            .create_branch_from_event("run-root", "event-2", "Release team run / branch")
            .await
            .unwrap();

        assert_ne!(branch.run.id, "run-root");
        assert_eq!(branch.run.title, "Release team run / branch");
        assert_eq!(branch.lineage.root_run_id, "run-root");
        assert_eq!(branch.lineage.parent_run_id.as_deref(), Some("run-root"));
        assert_eq!(branch.lineage.branched_from_event_id.as_deref(), Some("event-2"));
        assert_eq!(branch.lineage.branch_depth, 1);
        assert_eq!(branch.snapshots.len(), 1);
        assert_eq!(branch.snapshots[0].event_id, "event-2");
        assert_eq!(branch.run.events.len(), 2);
        assert_eq!(branch.run.events[1].kind, "checkpoint_summary");
        assert_eq!(
            branch.run.events[1].content,
            "Verification needs one more pass"
        );

        let loaded = repo.load_run_record(&branch.run.id).await.unwrap().unwrap();
        assert_eq!(
            loaded.lineage.branch_snapshot_id.as_deref(),
            Some(branch.snapshots[0].id.as_str())
        );
    }
}
