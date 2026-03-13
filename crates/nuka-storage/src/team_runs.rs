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

        sqlx::query(
            r#"
            insert into team_runs (
              id, team_id, title, goal, status, current_phase, lead_agent_id,
              charter_json, created_at, updated_at
            )
            values (
              ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
              coalesce(nullif(?9, ''), datetime('now')),
              coalesce(nullif(?10, ''), datetime('now'))
            )
            on conflict(id) do update set
              title = excluded.title,
              goal = excluded.goal,
              status = excluded.status,
              current_phase = excluded.current_phase,
              lead_agent_id = excluded.lead_agent_id,
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
        .bind(encode_json(&run.charter)?)
        .bind(run.created_at)
        .bind(run.updated_at)
        .execute(&mut *tx)
        .await?;

        sqlx::query("delete from team_run_agents where run_id = ?1")
            .bind(run.id.clone())
            .execute(&mut *tx)
            .await?;
        sqlx::query("delete from team_run_events where run_id = ?1")
            .bind(run.id.clone())
            .execute(&mut *tx)
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
            .execute(&mut *tx)
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
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
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

    pub async fn list_runs(&self) -> anyhow::Result<Vec<TeamRun>> {
        let rows = sqlx::query(
            r#"
            select
              id, team_id, title, goal, status, current_phase, lead_agent_id,
              charter_json, created_at, updated_at
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
              charter_json, created_at, updated_at
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

    async fn load_events_with_compactions(&self, run_id: &str) -> anyhow::Result<Vec<TeamRunEvent>> {
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
