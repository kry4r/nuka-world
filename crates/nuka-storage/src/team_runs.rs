use std::collections::HashMap;

use nuka_domain::team::{TeamRun, TeamRunAgent, TeamRunAgentStatus, TeamRunEvent, TeamRunStatus};
use serde::{de::DeserializeOwned, Serialize};
use sqlx::Row;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamRunCompaction {
    pub id: String,
    pub run_id: String,
    pub summary: String,
    pub compacted_event_count: usize,
    pub sequence: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamRunSnapshot {
    pub id: String,
    pub run_id: String,
    pub anchor_event_id: String,
    pub title: String,
    pub event_count: usize,
    pub created_at: String,
}

#[derive(Debug, Clone)]
struct StoredRunMetadata {
    title: String,
    branch_root_run_id: Option<String>,
}

pub struct TeamRunRepository {
    pool: sqlx::SqlitePool,
}

impl TeamRunRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create_run(&self, run: TeamRun) -> anyhow::Result<()> {
        self.save_run(run).await
    }

    pub async fn save_run(&self, run: TeamRun) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;
        self.save_run_in_tx(&mut tx, run).await?;
        tx.commit().await?;
        Ok(())
    }

    async fn save_run_in_tx(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
        run: TeamRun,
    ) -> anyhow::Result<()> {
        let route_json = encode_optional_json(&run.routing)?;
        sqlx::query(
            r#"
            insert into team_runs (
              id, team_id, title, goal, status, current_phase, lead_agent_id,
              route_json, charter_json, created_at, updated_at
            )
            values (
              ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
              coalesce(nullif(?10, ''), datetime('now')),
              coalesce(nullif(?11, ''), datetime('now'))
            )
            on conflict(id) do update set
              title = excluded.title,
              goal = excluded.goal,
              status = excluded.status,
              current_phase = excluded.current_phase,
              lead_agent_id = excluded.lead_agent_id,
              route_json = excluded.route_json,
              charter_json = excluded.charter_json,
              updated_at = coalesce(nullif(excluded.updated_at, ''), datetime('now'))
            "#,
        )
        .bind(run.id.clone())
        .bind(run.team_id.clone())
        .bind(run.title)
        .bind(run.goal)
        .bind(team_run_status_as_str(&run.status))
        .bind(run.current_phase)
        .bind(run.lead_agent_id.clone())
        .bind(route_json)
        .bind(encode_json(&run.charter)?)
        .bind(run.created_at)
        .bind(run.updated_at)
        .execute(tx.as_mut())
        .await?;

        sqlx::query("delete from team_run_agents where run_id = ?1")
            .bind(run.id.clone())
            .execute(tx.as_mut())
            .await?;
        sqlx::query("delete from team_run_events where run_id = ?1")
            .bind(run.id.clone())
            .execute(tx.as_mut())
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
            .execute(tx.as_mut())
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
            .execute(tx.as_mut())
            .await?;
        }

        Ok(())
    }

    pub async fn load_run(&self, run_id: &str) -> anyhow::Result<Option<TeamRun>> {
        self.load_run_with_mode(run_id, true).await
    }

    pub async fn load_run_live(&self, run_id: &str) -> anyhow::Result<Option<TeamRun>> {
        self.load_run_with_mode(run_id, false).await
    }

    pub async fn compact_events(
        &self,
        run_id: &str,
        event_ids: &[String],
        sequence: i64,
        summary: &str,
    ) -> anyhow::Result<()> {
        if event_ids.is_empty() {
            return Ok(());
        }

        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            insert into team_run_compactions (
              id, run_id, summary, compacted_event_count, sequence, created_at
            )
            values (?1, ?2, ?3, ?4, ?5, datetime('now'))
            "#,
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(run_id)
        .bind(summary)
        .bind(event_ids.len() as i64)
        .bind(sequence)
        .execute(&mut *tx)
        .await?;

        for event_id in event_ids {
            sqlx::query("delete from team_run_events where run_id = ?1 and id = ?2")
                .bind(run_id)
                .bind(event_id)
                .execute(&mut *tx)
                .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    pub async fn list_compactions(&self, run_id: &str) -> anyhow::Result<Vec<TeamRunCompaction>> {
        let rows = sqlx::query(
            r#"
            select id, run_id, summary, compacted_event_count, sequence, created_at
            from team_run_compactions
            where run_id = ?1
            order by sequence asc, created_at asc, rowid asc
            "#,
        )
        .bind(run_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| TeamRunCompaction {
                id: row.get("id"),
                run_id: row.get("run_id"),
                summary: row.get("summary"),
                compacted_event_count: row.get::<i64, _>("compacted_event_count") as usize,
                sequence: row.get("sequence"),
                created_at: row.get("created_at"),
            })
            .collect())
    }

    pub async fn list_snapshots(&self, run_id: &str) -> anyhow::Result<Vec<TeamRunSnapshot>> {
        let rows = sqlx::query(
            r#"
            select id, run_id, anchor_event_id, title, event_count, created_at
            from team_run_snapshots
            where run_id = ?1
            order by created_at asc, rowid asc
            "#,
        )
        .bind(run_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| TeamRunSnapshot {
                id: row.get("id"),
                run_id: row.get("run_id"),
                anchor_event_id: row.get("anchor_event_id"),
                title: row.get("title"),
                event_count: row.get::<i64, _>("event_count") as usize,
                created_at: row.get("created_at"),
            })
            .collect())
    }

    pub async fn branch_from_anchor(
        &self,
        run_id: &str,
        anchor_event_id: &str,
    ) -> anyhow::Result<(TeamRunSnapshot, String)> {
        let source_metadata = self
            .load_run_metadata(run_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("unknown team run: {run_id}"))?;
        let source_run = self
            .load_run(run_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("unknown team run: {run_id}"))?;
        let anchor_index = source_run
            .events
            .iter()
            .position(|event| event.id == anchor_event_id)
            .ok_or_else(|| anyhow::anyhow!("unknown team run anchor: {anchor_event_id}"))?;
        let snapshot = TeamRunSnapshot {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: run_id.to_string(),
            anchor_event_id: anchor_event_id.to_string(),
            title: snapshot_title(&source_run.events[anchor_index]),
            event_count: anchor_index + 1,
            created_at: current_timestamp(&self.pool).await?,
        };
        let branch_run_id = uuid::Uuid::new_v4().to_string();
        let branch_root_run_id = source_metadata
            .branch_root_run_id
            .unwrap_or_else(|| run_id.to_string());
        let mut branch_run = source_run.clone();
        let mut agent_id_map = HashMap::new();

        branch_run.id = branch_run_id.clone();
        branch_run.title = format!(
            "{} / Branch {}",
            source_metadata.title,
            self.next_branch_number(run_id).await?
        );
        branch_run.created_at = snapshot.created_at.clone();
        branch_run.updated_at = snapshot.created_at.clone();

        for agent in &mut branch_run.agents {
            let original_id = agent.id.clone();
            let next_id = uuid::Uuid::new_v4().to_string();
            agent.id = next_id.clone();
            agent.run_id = branch_run_id.clone();
            agent_id_map.insert(original_id, next_id);
        }

        branch_run.lead_agent_id = branch_run
            .lead_agent_id
            .and_then(|agent_id| agent_id_map.get(&agent_id).cloned());
        branch_run.events = source_run
            .events
            .into_iter()
            .take(snapshot.event_count)
            .map(|event| TeamRunEvent {
                id: uuid::Uuid::new_v4().to_string(),
                run_id: branch_run_id.clone(),
                kind: event.kind,
                agent_id: event
                    .agent_id
                    .and_then(|agent_id| agent_id_map.get(&agent_id).cloned()),
                title: event.title,
                content: event.content,
                status: event.status,
                tool_name: event.tool_name,
                tool_call_id: event.tool_call_id,
                tool_target: event.tool_target,
                sequence: event.sequence,
                created_at: event.created_at,
            })
            .collect();

        let mut tx = self.pool.begin().await?;
        sqlx::query(
            r#"
            insert into team_run_snapshots (
              id, run_id, anchor_event_id, title, event_count, created_at
            )
            values (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
        )
        .bind(snapshot.id.clone())
        .bind(snapshot.run_id.clone())
        .bind(snapshot.anchor_event_id.clone())
        .bind(snapshot.title.clone())
        .bind(snapshot.event_count as i64)
        .bind(snapshot.created_at.clone())
        .execute(&mut *tx)
        .await?;
        self.save_run_in_tx(&mut tx, branch_run).await?;
        sqlx::query(
            r#"
            update team_runs
            set
              branch_root_run_id = ?2,
              branch_parent_run_id = ?3,
              branch_source_snapshot_id = ?4,
              branch_anchor_event_id = ?5
            where id = ?1
            "#,
        )
        .bind(branch_run_id.clone())
        .bind(branch_root_run_id)
        .bind(run_id)
        .bind(snapshot.id.clone())
        .bind(snapshot.anchor_event_id.clone())
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        Ok((snapshot, branch_run_id))
    }

    pub async fn list_runs(&self) -> anyhow::Result<Vec<TeamRun>> {
        let rows = sqlx::query(
            r#"
            select
              id, team_id, title, goal, status, current_phase, lead_agent_id,
              route_json, charter_json, created_at, updated_at
            from team_runs
            order by updated_at desc, created_at desc
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut runs = Vec::with_capacity(rows.len());
        for row in rows {
            runs.push(self.map_run_row(row, true).await?);
        }

        Ok(runs)
    }

    async fn load_run_with_mode(
        &self,
        run_id: &str,
        include_compactions: bool,
    ) -> anyhow::Result<Option<TeamRun>> {
        let row = sqlx::query(
            r#"
            select
              id, team_id, title, goal, status, current_phase, lead_agent_id,
              route_json, charter_json, created_at, updated_at
            from team_runs
            where id = ?1
            limit 1
            "#,
        )
        .bind(run_id)
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(row) => Ok(Some(self.map_run_row(row, include_compactions).await?)),
            None => Ok(None),
        }
    }

    async fn map_run_row(
        &self,
        row: sqlx::sqlite::SqliteRow,
        include_compactions: bool,
    ) -> anyhow::Result<TeamRun> {
        let id: String = row.get("id");
        Ok(TeamRun {
            id: id.clone(),
            team_id: row.get("team_id"),
            title: row.get("title"),
            goal: row.get("goal"),
            status: parse_team_run_status(&row.get::<String, _>("status"))?,
            current_phase: row.get("current_phase"),
            lead_agent_id: row.get("lead_agent_id"),
            routing: decode_optional_json(row.get("route_json"))?,
            charter: decode_json(&row.get::<String, _>("charter_json"))?,
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
            agents: self.load_agents(&id).await?,
            events: if include_compactions {
                self.load_events_with_compactions(&id).await?
            } else {
                self.load_events(&id).await?
            },
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

    async fn load_events_with_compactions(
        &self,
        run_id: &str,
    ) -> anyhow::Result<Vec<TeamRunEvent>> {
        let mut events = self
            .list_compactions(run_id)
            .await?
            .into_iter()
            .map(|compaction| TeamRunEvent {
                id: compaction.id,
                run_id: compaction.run_id,
                kind: "compaction_summary".to_string(),
                agent_id: None,
                title: "Compacted context".to_string(),
                content: compaction.summary,
                status: Some("completed".to_string()),
                tool_name: None,
                tool_call_id: None,
                tool_target: None,
                sequence: compaction.sequence,
                created_at: compaction.created_at,
            })
            .collect::<Vec<_>>();
        events.extend(self.load_events(run_id).await?);
        events.sort_by(|left, right| {
            left.sequence
                .cmp(&right.sequence)
                .then(left.created_at.cmp(&right.created_at))
        });
        Ok(events)
    }

    async fn load_run_metadata(&self, run_id: &str) -> anyhow::Result<Option<StoredRunMetadata>> {
        let row = sqlx::query(
            r#"
            select title, branch_root_run_id
            from team_runs
            where id = ?1
            limit 1
            "#,
        )
        .bind(run_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| StoredRunMetadata {
            title: row.get("title"),
            branch_root_run_id: row.get("branch_root_run_id"),
        }))
    }

    async fn next_branch_number(&self, run_id: &str) -> anyhow::Result<i64> {
        let count: i64 =
            sqlx::query_scalar("select count(*) from team_runs where branch_parent_run_id = ?1")
                .bind(run_id)
                .fetch_one(&self.pool)
                .await?;

        Ok(count + 1)
    }
}

fn team_run_status_as_str(status: &TeamRunStatus) -> &'static str {
    match status {
        TeamRunStatus::Queued => "queued",
        TeamRunStatus::Active => "active",
        TeamRunStatus::WaitingForAgents => "waiting_for_agents",
        TeamRunStatus::WaitingForUser => "waiting_for_user",
        TeamRunStatus::BudgetPaused => "budget_paused",
        TeamRunStatus::Blocked => "blocked",
        TeamRunStatus::Completed => "completed",
        TeamRunStatus::Failed => "failed",
    }
}

fn parse_team_run_status(status: &str) -> anyhow::Result<TeamRunStatus> {
    match status {
        "queued" => Ok(TeamRunStatus::Queued),
        "active" => Ok(TeamRunStatus::Active),
        "waiting_for_agents" => Ok(TeamRunStatus::WaitingForAgents),
        "waiting_for_user" => Ok(TeamRunStatus::WaitingForUser),
        "budget_paused" => Ok(TeamRunStatus::BudgetPaused),
        "blocked" => Ok(TeamRunStatus::Blocked),
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

fn encode_optional_json<T: Serialize>(value: &Option<T>) -> anyhow::Result<Option<String>> {
    value
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(Into::into)
}

fn decode_optional_json<T: DeserializeOwned>(value: Option<String>) -> anyhow::Result<Option<T>> {
    value
        .map(|serialized| serde_json::from_str(&serialized))
        .transpose()
        .map_err(Into::into)
}

async fn current_timestamp(pool: &sqlx::SqlitePool) -> anyhow::Result<String> {
    Ok(sqlx::query_scalar("select datetime('now')")
        .fetch_one(pool)
        .await?)
}

fn snapshot_title(event: &TeamRunEvent) -> String {
    format!("{}: {}", event.kind, excerpt(&event.title, 48))
}

fn excerpt(content: &str, max_chars: usize) -> String {
    let mut excerpt = content.trim().chars().take(max_chars).collect::<String>();
    if content.chars().count() > max_chars {
        excerpt.push_str("...");
    }
    excerpt
}
