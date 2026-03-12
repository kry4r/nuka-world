#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkspaceSessionKind {
    DirectChat,
    TeamRun,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceSessionLineage {
    pub root_id: String,
    pub parent_id: Option<String>,
    pub branch_snapshot_id: Option<String>,
    pub branched_from_item_id: Option<String>,
    pub branch_depth: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceSessionSnapshot {
    pub id: String,
    pub anchor_id: String,
    pub anchor_kind: String,
    pub anchor_index: i64,
    pub title: String,
    pub excerpt: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceSessionSummary {
    pub id: String,
    pub kind: WorkspaceSessionKind,
    pub title: String,
    pub status: String,
    pub updated_at: String,
    pub lineage: WorkspaceSessionLineage,
}

#[derive(Debug, Clone)]
pub enum WorkspaceSessionDetail {
    DirectChat {
        session: nuka_domain::chat::ChatSessionSummary,
        messages: Vec<nuka_domain::chat::ChatMessage>,
        lineage: WorkspaceSessionLineage,
        snapshots: Vec<WorkspaceSessionSnapshot>,
    },
    TeamRun {
        run: nuka_domain::team::TeamRun,
        lineage: WorkspaceSessionLineage,
        snapshots: Vec<WorkspaceSessionSnapshot>,
    },
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
        let chat_records = nuka_storage::chat::ChatRepository::new(self.pool.clone())
            .list_session_records()
            .await?;

        let mut sessions = chat_rows
            .into_iter()
            .map(|row| {
                let id: String = sqlx::Row::get(&row, "id");
                let record = chat_records
                    .iter()
                    .find(|record| record.session.id == id)
                    .ok_or_else(|| anyhow::anyhow!("chat session disappeared during list: {id}"))?;

                Ok(WorkspaceSessionSummary {
                    id,
                    kind: WorkspaceSessionKind::DirectChat,
                    title: sqlx::Row::get(&row, "title"),
                    status: "active".to_string(),
                    updated_at: sqlx::Row::get(&row, "updated_at"),
                    lineage: WorkspaceSessionLineage::from_chat_lineage(&record.lineage),
                })
            })
            .collect::<anyhow::Result<Vec<_>>>()?;

        sessions.extend(
            nuka_storage::team_runs::TeamRunRepository::new(self.pool.clone())
                .list_run_records()
                .await?
                .into_iter()
                .map(|record| WorkspaceSessionSummary {
                    id: record.run.id,
                    kind: WorkspaceSessionKind::TeamRun,
                    title: record.run.title,
                    status: match record.run.status {
                        nuka_domain::team::TeamRunStatus::Active => "active".to_string(),
                        nuka_domain::team::TeamRunStatus::WaitingForAgents => {
                            "waiting_for_agents".to_string()
                        }
                        nuka_domain::team::TeamRunStatus::WaitingForUser => {
                            "waiting_for_user".to_string()
                        }
                        nuka_domain::team::TeamRunStatus::BudgetPaused => {
                            "budget_paused".to_string()
                        }
                        nuka_domain::team::TeamRunStatus::Completed => "completed".to_string(),
                        nuka_domain::team::TeamRunStatus::Failed => "failed".to_string(),
                    },
                    updated_at: record.run.updated_at,
                    lineage: WorkspaceSessionLineage::from_team_run_lineage(&record.lineage),
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
                match repo.load_session_record(session_id).await? {
                    Some(record) => Ok(Some(WorkspaceSessionDetail::DirectChat {
                        session: record.session,
                        messages: repo.list_messages(session_id).await?,
                        lineage: WorkspaceSessionLineage::from_chat_lineage(&record.lineage),
                        snapshots: repo
                            .list_session_snapshots(session_id)
                            .await?
                            .into_iter()
                            .map(WorkspaceSessionSnapshot::from_chat_snapshot)
                            .collect(),
                    })),
                    None => Ok(None),
                }
            }
            WorkspaceSessionKind::TeamRun => {
                let repo = nuka_storage::team_runs::TeamRunRepository::new(self.pool.clone());
                match repo.load_run_record(session_id).await? {
                    Some(record) => Ok(Some(WorkspaceSessionDetail::TeamRun {
                        run: record.run,
                        lineage: WorkspaceSessionLineage::from_team_run_lineage(&record.lineage),
                        snapshots: repo
                            .list_run_snapshots(session_id)
                            .await?
                            .into_iter()
                            .map(WorkspaceSessionSnapshot::from_team_run_snapshot)
                            .collect(),
                    })),
                    None => Ok(None),
                }
            }
        }
    }

    pub async fn create_branch(
        &self,
        session_id: &str,
        kind: WorkspaceSessionKind,
        anchor_id: &str,
        branch_title: &str,
    ) -> anyhow::Result<WorkspaceSessionDetail> {
        nuka_storage::migrations::run(&self.pool).await?;

        match kind {
            WorkspaceSessionKind::DirectChat => {
                let repo = nuka_storage::chat::ChatRepository::new(self.pool.clone());
                let branch = repo
                    .create_branch_from_message(session_id, anchor_id, branch_title)
                    .await?;
                Ok(WorkspaceSessionDetail::DirectChat {
                    session: branch.session.clone(),
                    messages: repo.list_messages(&branch.session.id).await?,
                    lineage: WorkspaceSessionLineage::from_chat_lineage(&branch.lineage),
                    snapshots: repo
                        .list_session_snapshots(&branch.session.id)
                        .await?
                        .into_iter()
                        .map(WorkspaceSessionSnapshot::from_chat_snapshot)
                        .collect(),
                })
            }
            WorkspaceSessionKind::TeamRun => {
                let repo = nuka_storage::team_runs::TeamRunRepository::new(self.pool.clone());
                let branch = repo
                    .create_branch_from_event(session_id, anchor_id, branch_title)
                    .await?;
                Ok(WorkspaceSessionDetail::TeamRun {
                    run: branch.run,
                    lineage: WorkspaceSessionLineage::from_team_run_lineage(&branch.lineage),
                    snapshots: repo
                        .list_run_snapshots(session_id)
                        .await?
                        .into_iter()
                        .filter(|snapshot| {
                            Some(snapshot.id.as_str()) == branch.lineage.branch_snapshot_id.as_deref()
                        })
                        .map(WorkspaceSessionSnapshot::from_team_run_snapshot)
                        .collect(),
                })
            }
        }
    }
}

impl WorkspaceSessionLineage {
    fn from_chat_lineage(value: &nuka_storage::chat::ChatSessionLineageRecord) -> Self {
        Self {
            root_id: value.root_session_id.clone(),
            parent_id: value.parent_session_id.clone(),
            branch_snapshot_id: value.branch_snapshot_id.clone(),
            branched_from_item_id: value.branched_from_message_id.clone(),
            branch_depth: value.branch_depth,
        }
    }

    fn from_team_run_lineage(value: &nuka_storage::team_runs::TeamRunLineageRecord) -> Self {
        Self {
            root_id: value.root_run_id.clone(),
            parent_id: value.parent_run_id.clone(),
            branch_snapshot_id: value.branch_snapshot_id.clone(),
            branched_from_item_id: value.branched_from_event_id.clone(),
            branch_depth: value.branch_depth,
        }
    }
}

impl WorkspaceSessionSnapshot {
    fn from_chat_snapshot(value: nuka_storage::chat::ChatSessionSnapshotRecord) -> Self {
        Self {
            id: value.id,
            anchor_id: value.message_id,
            anchor_kind: value.message_role,
            anchor_index: value.message_index as i64,
            title: value.title,
            excerpt: value.message_excerpt,
            created_at: value.created_at,
        }
    }

    fn from_team_run_snapshot(value: nuka_storage::team_runs::TeamRunSnapshotRecord) -> Self {
        Self {
            id: value.id,
            anchor_id: value.event_id,
            anchor_kind: value.event_kind,
            anchor_index: value.event_sequence,
            title: value.title,
            excerpt: value.event_excerpt,
            created_at: value.created_at,
        }
    }
}
