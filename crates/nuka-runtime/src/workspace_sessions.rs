use sqlx::Row;

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

        let chat_rows = sqlx::query(
            r#"
            select
              chat_sessions.id,
              chat_sessions.title,
              coalesce(max(chat_messages.created_at), chat_sessions.created_at) as updated_at
            from chat_sessions
            left join chat_messages on chat_messages.session_id = chat_sessions.id
            group by chat_sessions.id, chat_sessions.title, chat_sessions.created_at
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
            })
            .collect::<Vec<_>>();

        sessions.extend(
            nuka_storage::team_runs::TeamRunRepository::new(self.pool.clone())
                .list_runs()
                .await?
                .into_iter()
                .map(|run| WorkspaceSessionSummary {
                    id: run.id,
                    kind: WorkspaceSessionKind::TeamRun,
                    title: run.title,
                    status: match run.status {
                        nuka_domain::team::TeamRunStatus::Active => "active".to_string(),
                        nuka_domain::team::TeamRunStatus::WaitingForAgents => "waiting_for_agents".to_string(),
                        nuka_domain::team::TeamRunStatus::WaitingForUser => "waiting_for_user".to_string(),
                        nuka_domain::team::TeamRunStatus::BudgetPaused => "budget_paused".to_string(),
                        nuka_domain::team::TeamRunStatus::Completed => "completed".to_string(),
                        nuka_domain::team::TeamRunStatus::Failed => "failed".to_string(),
                    },
                    updated_at: run.updated_at,
                }),
        );

        sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        Ok(sessions)
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
            WorkspaceSessionKind::TeamRun => Ok(
                nuka_storage::team_runs::TeamRunRepository::new(self.pool.clone())
                    .load_run(session_id)
                    .await?
                    .map(WorkspaceSessionDetail::TeamRun),
            ),
        }
    }
}
