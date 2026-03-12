use nuka_domain::{
    team::{Team, TeamAgent, TeamAgentAssignment, TeamStatus},
};
use serde::{de::DeserializeOwned, Serialize};
use sqlx::Row;

pub struct TeamRepository {
    pool: sqlx::SqlitePool,
}

impl TeamRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn save_team(&self, team: Team) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            insert into teams (
              id, name, goal, summary, prompt_constraints, permission_policy,
              success_criteria, coordination_policy, status, created_at, updated_at
            )
            values (
              ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
              coalesce(nullif(?10, ''), datetime('now')),
              coalesce(nullif(?11, ''), datetime('now'))
            )
            on conflict(id) do update set
              name = excluded.name,
              goal = excluded.goal,
              summary = excluded.summary,
              prompt_constraints = excluded.prompt_constraints,
              permission_policy = excluded.permission_policy,
              success_criteria = excluded.success_criteria,
              coordination_policy = excluded.coordination_policy,
              status = excluded.status,
              updated_at = coalesce(nullif(excluded.updated_at, ''), datetime('now'))
            "#,
        )
        .bind(team.id.clone())
        .bind(team.name)
        .bind(team.goal)
        .bind(team.summary)
        .bind(team.prompt_constraints)
        .bind(team.permission_policy)
        .bind(team.success_criteria)
        .bind(team.coordination_policy)
        .bind(team_status_as_str(&team.status))
        .bind(team.created_at)
        .bind(team.updated_at)
        .execute(&mut *tx)
        .await?;

        sqlx::query("delete from team_agents where team_id = ?1")
            .bind(team.id.clone())
            .execute(&mut *tx)
            .await?;

        for agent in team.agents {
            sqlx::query(
                r#"
                insert into team_agents (
                  id, team_id, agent_id, enabled, name, role, responsibility, system_prompt,
                  tool_bindings_json, tool_use_policy_json, order_hint, prompt_override,
                  permission_override_json, created_at, updated_at
                )
                values (
                  ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                  coalesce(nullif(?14, ''), datetime('now')),
                  coalesce(nullif(?15, ''), datetime('now'))
                )
                "#,
            )
            .bind(agent.id)
            .bind(team.id.clone())
            .bind(Option::<String>::None)
            .bind(1_i64)
            .bind(agent.name)
            .bind(agent.role)
            .bind(agent.responsibility)
            .bind(agent.system_prompt)
            .bind(encode_json(&agent.tool_bindings)?)
            .bind(encode_json(&agent.tool_use_policy)?)
            .bind(agent.order_hint)
            .bind(Option::<String>::None)
            .bind("{}")
            .bind(agent.created_at)
            .bind(agent.updated_at)
            .execute(&mut *tx)
            .await?;
        }

        for assignment in team.agent_assignments {
            sqlx::query(
                r#"
                insert into team_agents (
                  id, team_id, agent_id, enabled, name, role, responsibility, system_prompt,
                  tool_bindings_json, tool_use_policy_json, order_hint, prompt_override,
                  permission_override_json, created_at, updated_at
                )
                values (
                  ?1, ?2, ?3, ?4, '', '', '', '', '[]', ?5, ?6, ?7, ?8,
                  coalesce(nullif(?9, ''), datetime('now')),
                  coalesce(nullif(?10, ''), datetime('now'))
                )
                "#,
            )
            .bind(assignment.id)
            .bind(team.id.clone())
            .bind(assignment.agent_id)
            .bind(assignment.enabled as i64)
            .bind(encode_json(&nuka_domain::tool::ToolUsePolicy::default())?)
            .bind(assignment.order_hint)
            .bind(assignment.prompt_override)
            .bind(assignment.permission_override_json)
            .bind(assignment.created_at)
            .bind(assignment.updated_at)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    pub async fn list_teams(&self) -> anyhow::Result<Vec<Team>> {
        let rows = sqlx::query(
            r#"
            select id, name, goal, summary, prompt_constraints, permission_policy, success_criteria, coordination_policy, status, created_at, updated_at
            from teams
            where status != 'deleted'
            order by updated_at desc, created_at desc
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut teams = Vec::with_capacity(rows.len());
        for row in rows {
            let id: String = row.get("id");
            teams.push(Team {
                id: id.clone(),
                name: row.get("name"),
                goal: row.get("goal"),
                summary: row.get("summary"),
                prompt_constraints: row.get("prompt_constraints"),
                permission_policy: row.get("permission_policy"),
                success_criteria: row.get("success_criteria"),
                coordination_policy: row.get("coordination_policy"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                status: parse_team_status(&row.get::<String, _>("status"))?,
                agents: self.load_agents(&id).await?,
                agent_assignments: self.load_assignments(&id).await?,
            });
        }

        Ok(teams)
    }

    pub async fn load_team(&self, team_id: &str) -> anyhow::Result<Option<Team>> {
        let row = sqlx::query(
            r#"
            select id, name, goal, summary, prompt_constraints, permission_policy, success_criteria, coordination_policy, status, created_at, updated_at
            from teams
            where id = ?1
            limit 1
            "#,
        )
        .bind(team_id)
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(row) => {
                let id: String = row.get("id");
                Ok(Some(Team {
                    id: id.clone(),
                    name: row.get("name"),
                    goal: row.get("goal"),
                    summary: row.get("summary"),
                    prompt_constraints: row.get("prompt_constraints"),
                    permission_policy: row.get("permission_policy"),
                    success_criteria: row.get("success_criteria"),
                    coordination_policy: row.get("coordination_policy"),
                    created_at: row.get("created_at"),
                    updated_at: row.get("updated_at"),
                    status: parse_team_status(&row.get::<String, _>("status"))?,
                    agents: self.load_agents(&id).await?,
                    agent_assignments: self.load_assignments(&id).await?,
                }))
            }
            None => Ok(None),
        }
    }

    pub async fn delete_team(&self, team_id: &str) -> anyhow::Result<()> {
        sqlx::query(
            "update teams set status = 'deleted', updated_at = datetime('now') where id = ?1",
        )
        .bind(team_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    async fn load_agents(&self, team_id: &str) -> anyhow::Result<Vec<TeamAgent>> {
        let rows = sqlx::query(
            r#"
            select
              id, team_id, name, role, responsibility, system_prompt,
              tool_bindings_json, tool_use_policy_json, order_hint, created_at, updated_at
            from team_agents
            where team_id = ?1 and ifnull(agent_id, '') = ''
            order by order_hint asc, created_at asc
            "#,
        )
        .bind(team_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|row| {
                Ok(TeamAgent {
                    id: row.get("id"),
                    team_id: row.get("team_id"),
                    name: row.get("name"),
                    role: row.get("role"),
                    responsibility: row.get("responsibility"),
                    system_prompt: row.get("system_prompt"),
                    tool_bindings: decode_json(&row.get::<String, _>("tool_bindings_json"))?,
                    tool_use_policy: decode_json(&row.get::<String, _>("tool_use_policy_json"))?,
                    order_hint: row.get("order_hint"),
                    created_at: row.get("created_at"),
                    updated_at: row.get("updated_at"),
                })
            })
            .collect()
    }

    async fn load_assignments(&self, team_id: &str) -> anyhow::Result<Vec<TeamAgentAssignment>> {
        let rows = sqlx::query(
            r#"
            select
              id, team_id, agent_id, enabled, order_hint, prompt_override,
              permission_override_json, created_at, updated_at
            from team_agents
            where team_id = ?1 and ifnull(agent_id, '') != ''
            order by order_hint asc, created_at asc
            "#,
        )
        .bind(team_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|row| {
                Ok(TeamAgentAssignment {
                    id: row.get("id"),
                    team_id: row.get("team_id"),
                    agent_id: row.get("agent_id"),
                    enabled: row.get::<i64, _>("enabled") != 0,
                    order_hint: row.get("order_hint"),
                    prompt_override: row.get("prompt_override"),
                    permission_override_json: row.get("permission_override_json"),
                    created_at: row.get("created_at"),
                    updated_at: row.get("updated_at"),
                })
            })
            .collect()
    }
}

fn team_status_as_str(status: &TeamStatus) -> &'static str {
    match status {
        TeamStatus::Ready => "ready",
        TeamStatus::Archived => "archived",
        TeamStatus::Deleted => "deleted",
    }
}

fn parse_team_status(status: &str) -> anyhow::Result<TeamStatus> {
    match status {
        "ready" => Ok(TeamStatus::Ready),
        "archived" => Ok(TeamStatus::Archived),
        "deleted" => Ok(TeamStatus::Deleted),
        other => anyhow::bail!("unknown team status: {other}"),
    }
}

fn encode_json<T: Serialize>(value: &T) -> anyhow::Result<String> {
    Ok(serde_json::to_string(value)?)
}

fn decode_json<T: DeserializeOwned>(value: &str) -> anyhow::Result<T> {
    Ok(serde_json::from_str(value)?)
}
