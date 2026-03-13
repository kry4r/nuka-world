use sqlx::Row;

const TEAM_RUN_STUCK_TIMEOUT_SQL: &str = "select datetime('now', '-5 minutes')";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkspaceSessionKind {
    DirectChat,
    TeamRun,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceSessionSummary {
    pub id: String,
    pub kind: WorkspaceSessionKind,
    pub title: String,
    pub status: String,
    pub updated_at: String,
    pub lineage: Option<WorkspaceSessionLineage>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceSessionLineage {
    pub root_id: String,
    pub parent_id: String,
    pub snapshot_id: String,
    pub anchor_id: String,
}

#[derive(Debug, Clone)]
pub enum WorkspaceSessionDetail {
    DirectChat {
        session: nuka_domain::chat::ChatSessionSummary,
        messages: Vec<nuka_domain::chat::ChatMessage>,
    },
    TeamRun(nuka_domain::team::TeamRun),
}

#[derive(Debug, Clone)]
pub struct WorkspaceSessionsService {
    pool: sqlx::SqlitePool,
}

impl WorkspaceSessionsService {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> anyhow::Result<Vec<WorkspaceSessionSummary>> {
        nuka_storage::migrations::run(&self.pool).await?;
        let team_run_stuck_cutoff: String = sqlx::query_scalar(TEAM_RUN_STUCK_TIMEOUT_SQL)
            .fetch_one(&self.pool)
            .await?;

        let chat_rows = sqlx::query(
            r#"
            select
              chat_sessions.id,
              chat_sessions.title,
              coalesce(max(chat_messages.created_at), chat_sessions.created_at) as updated_at
              ,
              chat_sessions.branch_root_session_id,
              chat_sessions.branch_parent_session_id,
              chat_sessions.branch_source_snapshot_id,
              chat_sessions.branch_anchor_message_id
            from chat_sessions
            left join chat_messages on chat_messages.session_id = chat_sessions.id
            group by
              chat_sessions.id,
              chat_sessions.title,
              chat_sessions.created_at,
              chat_sessions.branch_root_session_id,
              chat_sessions.branch_parent_session_id,
              chat_sessions.branch_source_snapshot_id,
              chat_sessions.branch_anchor_message_id
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut sessions = chat_rows
            .into_iter()
            .map(|row| WorkspaceSessionSummary {
                id: row.get("id"),
                kind: WorkspaceSessionKind::DirectChat,
                title: row.get("title"),
                status: "active".to_string(),
                updated_at: row.get("updated_at"),
                lineage: workspace_lineage_from_row(
                    &row,
                    "branch_root_session_id",
                    "branch_parent_session_id",
                    "branch_source_snapshot_id",
                    "branch_anchor_message_id",
                ),
            })
            .collect::<Vec<_>>();

        let team_run_rows = sqlx::query(
            r#"
            select
              id,
              title,
              status,
              updated_at,
              branch_root_run_id,
              branch_parent_run_id,
              branch_source_snapshot_id,
              branch_anchor_event_id
            from team_runs
            order by updated_at desc, created_at desc
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        sessions.extend(
            team_run_rows
                .into_iter()
                .map(|row| WorkspaceSessionSummary {
                    id: row.get("id"),
                    kind: WorkspaceSessionKind::TeamRun,
                    title: row.get("title"),
                    status: project_team_run_status(
                        row.get("status"),
                        row.get("updated_at"),
                        &team_run_stuck_cutoff,
                    ),
                    updated_at: row.get("updated_at"),
                    lineage: workspace_lineage_from_row(
                        &row,
                        "branch_root_run_id",
                        "branch_parent_run_id",
                        "branch_source_snapshot_id",
                        "branch_anchor_event_id",
                    ),
                }),
        );

        sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        Ok(sessions)
    }

    pub async fn branch(
        &self,
        session_id: &str,
        kind: WorkspaceSessionKind,
        anchor_id: &str,
    ) -> anyhow::Result<WorkspaceSessionSummary> {
        nuka_storage::migrations::run(&self.pool).await?;

        let branch_id = match kind.clone() {
            WorkspaceSessionKind::DirectChat => {
                nuka_storage::chat::ChatRepository::new(self.pool.clone())
                    .branch_from_anchor(session_id, anchor_id)
                    .await?
                    .1
            }
            WorkspaceSessionKind::TeamRun => {
                nuka_storage::team_runs::TeamRunRepository::new(self.pool.clone())
                    .branch_from_anchor(session_id, anchor_id)
                    .await?
                    .1
            }
        };

        self.list()
            .await?
            .into_iter()
            .find(|session| session.id == branch_id && session.kind == kind)
            .ok_or_else(|| anyhow::anyhow!("branched workspace session disappeared: {branch_id}"))
    }

    pub async fn load(
        &self,
        session_id: &str,
        kind: WorkspaceSessionKind,
    ) -> anyhow::Result<Option<WorkspaceSessionDetail>> {
        nuka_storage::migrations::run(&self.pool).await?;

        match kind {
            WorkspaceSessionKind::DirectChat => {
                let repo = nuka_storage::chat::ChatRepository::new(self.pool.clone());
                let session = repo
                    .list_sessions()
                    .await?
                    .into_iter()
                    .find(|session| session.id == session_id);
                match session {
                    Some(session) => Ok(Some(WorkspaceSessionDetail::DirectChat {
                        messages: repo.list_messages(session_id).await?,
                        session,
                    })),
                    None => Ok(None),
                }
            }
            WorkspaceSessionKind::TeamRun => Ok(nuka_storage::team_runs::TeamRunRepository::new(
                self.pool.clone(),
            )
            .load_run(session_id)
            .await?
            .map(WorkspaceSessionDetail::TeamRun)),
        }
    }
}

fn workspace_lineage_from_row(
    row: &sqlx::sqlite::SqliteRow,
    root_column: &str,
    parent_column: &str,
    snapshot_column: &str,
    anchor_column: &str,
) -> Option<WorkspaceSessionLineage> {
    let root_id: Option<String> = row.get(root_column);
    let parent_id: Option<String> = row.get(parent_column);
    let snapshot_id: Option<String> = row.get(snapshot_column);
    let anchor_id: Option<String> = row.get(anchor_column);

    match (root_id, parent_id, snapshot_id, anchor_id) {
        (Some(root_id), Some(parent_id), Some(snapshot_id), Some(anchor_id)) => {
            Some(WorkspaceSessionLineage {
                root_id,
                parent_id,
                snapshot_id,
                anchor_id,
            })
        }
        _ => None,
    }
}

fn project_team_run_status(status: String, updated_at: String, stale_cutoff: &str) -> String {
    let stale = updated_at.as_str() <= stale_cutoff;

    match status.as_str() {
        "queued" | "active" | "waiting_for_agents" if stale => "stuck".to_string(),
        "active" | "waiting_for_agents" => "running".to_string(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn list_projects_stale_active_team_runs_as_stuck() {
        let pool = crate::settings_service::test_pool();
        nuka_storage::migrations::run(&pool).await.unwrap();
        nuka_storage::team_runs::TeamRunRepository::new(pool.clone())
            .save_run(nuka_domain::team::TeamRun {
                id: "run-stale".to_string(),
                team_id: "team-release".to_string(),
                title: "Release Team Run".to_string(),
                goal: "Ship the release".to_string(),
                status: nuka_domain::team::TeamRunStatus::Active,
                current_phase: "analysis".to_string(),
                lead_agent_id: None,
                charter: nuka_domain::team::RunCharter::default_for_goal("Ship the release"),
                created_at: "2000-01-01 00:00:00".to_string(),
                updated_at: "2000-01-01 00:00:00".to_string(),
                routing: None,
                agents: Vec::new(),
                events: Vec::new(),
            })
            .await
            .unwrap();

        let sessions = super::WorkspaceSessionsService::new(pool)
            .list()
            .await
            .unwrap();
        let run = sessions
            .into_iter()
            .find(|session| session.id == "run-stale")
            .unwrap();

        assert_eq!(run.status, "stuck");
    }
}
