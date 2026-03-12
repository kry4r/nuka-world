use nuka_domain::chat::{ChatMessage, ChatMessageRole, ChatSessionSummary};
use sqlx::Row;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatSessionLineageRecord {
    pub root_session_id: String,
    pub parent_session_id: Option<String>,
    pub branch_snapshot_id: Option<String>,
    pub branched_from_message_id: Option<String>,
    pub branch_depth: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatSessionRecord {
    pub session: ChatSessionSummary,
    pub lineage: ChatSessionLineageRecord,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatSessionSnapshotRecord {
    pub id: String,
    pub session_id: String,
    pub message_id: String,
    pub message_index: usize,
    pub title: String,
    pub message_role: String,
    pub message_excerpt: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatSessionCompactionRecord {
    pub id: String,
    pub session_id: String,
    pub message_index: usize,
    pub source_message_count: usize,
    pub summary: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatSessionBranchRecord {
    pub session: ChatSessionSummary,
    pub lineage: ChatSessionLineageRecord,
    pub snapshots: Vec<ChatSessionSnapshotRecord>,
}

pub struct ChatRepository {
    pool: sqlx::SqlitePool,
}

impl ChatRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create_session(&self, session: ChatSessionSummary) -> anyhow::Result<()> {
        let lineage = ChatSessionLineageRecord {
            root_session_id: session.id.clone(),
            parent_session_id: None,
            branch_snapshot_id: None,
            branched_from_message_id: None,
            branch_depth: 0,
        };

        sqlx::query(
            r#"
            insert into chat_sessions (
              id, title, provider_id, workflow_id, message_count, created_at,
              root_session_id, parent_session_id, branch_snapshot_id, branched_from_message_id, branch_depth
            )
            values (?1, ?2, ?3, ?4, ?5, datetime('now'), ?6, ?7, ?8, ?9, ?10)
            on conflict(id) do update set
              title = excluded.title,
              provider_id = excluded.provider_id,
              workflow_id = excluded.workflow_id,
              message_count = excluded.message_count,
              root_session_id = excluded.root_session_id,
              parent_session_id = excluded.parent_session_id,
              branch_snapshot_id = excluded.branch_snapshot_id,
              branched_from_message_id = excluded.branched_from_message_id,
              branch_depth = excluded.branch_depth
            "#,
        )
        .bind(&session.id)
        .bind(&session.title)
        .bind(&session.provider_id)
        .bind(&session.workflow_id)
        .bind(session.message_count as i64)
        .bind(&lineage.root_session_id)
        .bind(&lineage.parent_session_id)
        .bind(&lineage.branch_snapshot_id)
        .bind(&lineage.branched_from_message_id)
        .bind(lineage.branch_depth as i64)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn append_message(&self, message: ChatMessage) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            "insert into chat_messages (id, session_id, role, content, created_at) values (?1, ?2, ?3, ?4, datetime('now'))",
        )
        .bind(message.id)
        .bind(message.session_id.clone())
        .bind(role_as_str(&message.role))
        .bind(message.content)
        .execute(&mut *tx)
        .await?;

        sqlx::query("update chat_sessions set message_count = message_count + 1 where id = ?1")
            .bind(message.session_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }

    pub async fn list_sessions(&self) -> anyhow::Result<Vec<ChatSessionSummary>> {
        Ok(self
            .list_session_records()
            .await?
            .into_iter()
            .map(|record| record.session)
            .collect())
    }

    pub async fn list_session_records(&self) -> anyhow::Result<Vec<ChatSessionRecord>> {
        let rows = sqlx::query(
            r#"
            select
              id,
              title,
              provider_id,
              workflow_id,
              message_count,
              root_session_id,
              parent_session_id,
              branch_snapshot_id,
              branched_from_message_id,
              branch_depth
            from chat_sessions
            order by created_at asc, rowid asc
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(map_session_record).collect()
    }

    pub async fn list_messages(&self, session_id: &str) -> anyhow::Result<Vec<ChatMessage>> {
        let rows = sqlx::query(
            "select id, session_id, role, content from chat_messages where session_id = ?1 order by created_at asc, rowid asc",
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(map_message).collect()
    }

    pub async fn load_session_record(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Option<ChatSessionRecord>> {
        let row = sqlx::query(
            r#"
            select
              id,
              title,
              provider_id,
              workflow_id,
              message_count,
              root_session_id,
              parent_session_id,
              branch_snapshot_id,
              branched_from_message_id,
              branch_depth
            from chat_sessions
            where id = ?1
            limit 1
            "#,
        )
        .bind(session_id)
        .fetch_optional(&self.pool)
        .await?;

        row.map(map_session_record).transpose()
    }

    pub async fn list_session_snapshots(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Vec<ChatSessionSnapshotRecord>> {
        let rows = sqlx::query(
            r#"
            select
              id,
              session_id,
              message_id,
              message_index,
              title,
              message_role,
              message_excerpt,
              created_at
            from chat_session_snapshots
            where session_id = ?1
            order by message_index asc, created_at asc, rowid asc
            "#,
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(map_snapshot).collect())
    }

    pub async fn create_session_compaction(
        &self,
        record: ChatSessionCompactionRecord,
    ) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            insert into chat_session_compactions (
              id, session_id, message_index, source_message_count, summary, created_at
            )
            values (?1, ?2, ?3, ?4, ?5, datetime('now'))
            "#,
        )
        .bind(record.id)
        .bind(record.session_id)
        .bind(record.message_index as i64)
        .bind(record.source_message_count as i64)
        .bind(record.summary)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_session_compactions(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Vec<ChatSessionCompactionRecord>> {
        let rows = sqlx::query(
            r#"
            select
              id,
              session_id,
              message_index,
              source_message_count,
              summary,
              created_at
            from chat_session_compactions
            where session_id = ?1
            order by message_index asc, created_at asc, rowid asc
            "#,
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(map_compaction).collect())
    }

    pub async fn create_branch_from_message(
        &self,
        source_session_id: &str,
        message_id: &str,
        branch_title: &str,
    ) -> anyhow::Result<ChatSessionBranchRecord> {
        let source = self
            .load_session_record(source_session_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("unknown chat session: {source_session_id}"))?;
        let source_messages = self.list_messages(source_session_id).await?;
        let anchor_index = source_messages
            .iter()
            .position(|message| message.id == message_id)
            .ok_or_else(|| anyhow::anyhow!("unknown chat message: {message_id}"))?;
        let anchor_message = &source_messages[anchor_index];
        let snapshot_id = uuid::Uuid::new_v4().to_string();
        let child_session_id = uuid::Uuid::new_v4().to_string();
        let lineage = ChatSessionLineageRecord {
            root_session_id: source.lineage.root_session_id.clone(),
            parent_session_id: Some(source.session.id.clone()),
            branch_snapshot_id: Some(snapshot_id.clone()),
            branched_from_message_id: Some(anchor_message.id.clone()),
            branch_depth: source.lineage.branch_depth + 1,
        };
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            insert into chat_session_snapshots (
              id, session_id, message_id, message_index, title, message_role, message_excerpt, created_at
            )
            values (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
            "#,
        )
        .bind(&snapshot_id)
        .bind(source_session_id)
        .bind(&anchor_message.id)
        .bind((anchor_index + 1) as i64)
        .bind(snapshot_title(branch_title, anchor_index + 1))
        .bind(role_as_str(&anchor_message.role))
        .bind(message_excerpt(&anchor_message.content))
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            insert into chat_sessions (
              id, title, provider_id, workflow_id, message_count, created_at,
              root_session_id, parent_session_id, branch_snapshot_id, branched_from_message_id, branch_depth
            )
            values (?1, ?2, ?3, ?4, 0, datetime('now'), ?5, ?6, ?7, ?8, ?9)
            "#,
        )
        .bind(&child_session_id)
        .bind(branch_title)
        .bind(&source.session.provider_id)
        .bind(&source.session.workflow_id)
        .bind(&lineage.root_session_id)
        .bind(&lineage.parent_session_id)
        .bind(&lineage.branch_snapshot_id)
        .bind(&lineage.branched_from_message_id)
        .bind(lineage.branch_depth as i64)
        .execute(&mut *tx)
        .await?;

        for message in source_messages.iter().take(anchor_index + 1) {
            sqlx::query(
                r#"
                insert into chat_messages (id, session_id, role, content, created_at)
                values (?1, ?2, ?3, ?4, datetime('now'))
                "#,
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(&child_session_id)
            .bind(role_as_str(&message.role))
            .bind(&message.content)
            .execute(&mut *tx)
            .await?;
        }

        sqlx::query("update chat_sessions set message_count = ?2 where id = ?1")
            .bind(&child_session_id)
            .bind((anchor_index + 1) as i64)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;

        let session = self
            .load_session_record(&child_session_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("branched chat session disappeared after save"))?;
        let snapshot = self
            .list_session_snapshots(source_session_id)
            .await?
            .into_iter()
            .find(|record| record.id == snapshot_id)
            .ok_or_else(|| anyhow::anyhow!("chat session snapshot disappeared after save"))?;

        Ok(ChatSessionBranchRecord {
            session: session.session,
            lineage: session.lineage,
            snapshots: vec![snapshot],
        })
    }
}

fn map_message(row: sqlx::sqlite::SqliteRow) -> anyhow::Result<ChatMessage> {
    Ok(ChatMessage {
        id: row.get("id"),
        session_id: row.get("session_id"),
        role: parse_role(&row.get::<String, _>("role"))?,
        content: row.get("content"),
    })
}

fn map_session_record(row: sqlx::sqlite::SqliteRow) -> anyhow::Result<ChatSessionRecord> {
    let session_id: String = row.get("id");
    let root_session_id = row
        .try_get::<Option<String>, _>("root_session_id")?
        .unwrap_or_else(|| session_id.clone());

    Ok(ChatSessionRecord {
        session: ChatSessionSummary {
            id: session_id.clone(),
            title: row.get("title"),
            provider_id: row.get("provider_id"),
            workflow_id: row.get("workflow_id"),
            message_count: row.get::<i64, _>("message_count") as usize,
        },
        lineage: ChatSessionLineageRecord {
            root_session_id,
            parent_session_id: row.try_get("parent_session_id")?,
            branch_snapshot_id: row.try_get("branch_snapshot_id")?,
            branched_from_message_id: row.try_get("branched_from_message_id")?,
            branch_depth: row.get::<i64, _>("branch_depth") as usize,
        },
    })
}

fn map_snapshot(row: sqlx::sqlite::SqliteRow) -> ChatSessionSnapshotRecord {
    ChatSessionSnapshotRecord {
        id: row.get("id"),
        session_id: row.get("session_id"),
        message_id: row.get("message_id"),
        message_index: row.get::<i64, _>("message_index") as usize,
        title: row.get("title"),
        message_role: row.get("message_role"),
        message_excerpt: row.get("message_excerpt"),
        created_at: row.get("created_at"),
    }
}

fn map_compaction(row: sqlx::sqlite::SqliteRow) -> ChatSessionCompactionRecord {
    ChatSessionCompactionRecord {
        id: row.get("id"),
        session_id: row.get("session_id"),
        message_index: row.get::<i64, _>("message_index") as usize,
        source_message_count: row.get::<i64, _>("source_message_count") as usize,
        summary: row.get("summary"),
        created_at: row.get("created_at"),
    }
}

fn role_as_str(role: &ChatMessageRole) -> &'static str {
    match role {
        ChatMessageRole::System => "system",
        ChatMessageRole::User => "user",
        ChatMessageRole::Assistant => "assistant",
        ChatMessageRole::Tool => "tool",
    }
}

fn parse_role(role: &str) -> anyhow::Result<ChatMessageRole> {
    match role {
        "system" => Ok(ChatMessageRole::System),
        "user" => Ok(ChatMessageRole::User),
        "assistant" => Ok(ChatMessageRole::Assistant),
        "tool" => Ok(ChatMessageRole::Tool),
        other => anyhow::bail!("unknown chat role: {other}"),
    }
}

fn snapshot_title(branch_title: &str, message_index: usize) -> String {
    format!("{branch_title} @ {message_index}")
}

fn message_excerpt(content: &str) -> String {
    content.chars().take(160).collect()
}

#[cfg(test)]
mod tests {
    use nuka_domain::chat::{ChatMessage, ChatMessageRole, ChatSessionSummary};

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
        sqlx::query_scalar::<_, i64>("select count(*) from pragma_table_info(?1) where name = ?2")
            .bind(table)
            .bind(column)
            .fetch_one(db)
            .await
            .unwrap()
            > 0
    }

    #[tokio::test]
    async fn chat_repository_migrations_add_branching_tables_and_lineage_columns() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        assert!(table_exists(&db, "chat_session_snapshots").await);
        assert!(table_exists(&db, "chat_session_compactions").await);
        assert!(column_exists(&db, "chat_sessions", "root_session_id").await);
        assert!(column_exists(&db, "chat_sessions", "parent_session_id").await);
        assert!(column_exists(&db, "chat_sessions", "branch_snapshot_id").await);
        assert!(column_exists(&db, "chat_sessions", "branched_from_message_id").await);
        assert!(column_exists(&db, "chat_sessions", "branch_depth").await);
    }

    #[tokio::test]
    async fn create_branch_from_message_clones_history_and_persists_snapshot_lineage() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = super::ChatRepository::new(db.clone());
        repo.create_session(ChatSessionSummary {
            id: "session-root".to_string(),
            title: "Release review".to_string(),
            provider_id: Some("provider-local".to_string()),
            workflow_id: None,
            message_count: 0,
        })
        .await
        .unwrap();
        for (id, role, content) in [
            (
                "message-1",
                ChatMessageRole::User,
                "Summarize the release blockers",
            ),
            (
                "message-2",
                ChatMessageRole::Assistant,
                "The main blockers are notes and verification",
            ),
            (
                "message-3",
                ChatMessageRole::User,
                "Draft the final ship checklist",
            ),
        ] {
            repo.append_message(ChatMessage {
                id: id.to_string(),
                session_id: "session-root".to_string(),
                role,
                content: content.to_string(),
            })
            .await
            .unwrap();
        }

        let branch = repo
            .create_branch_from_message("session-root", "message-2", "Release review / branch")
            .await
            .unwrap();

        assert_ne!(branch.session.id, "session-root");
        assert_eq!(branch.session.title, "Release review / branch");
        assert_eq!(branch.lineage.root_session_id, "session-root");
        assert_eq!(
            branch.lineage.parent_session_id.as_deref(),
            Some("session-root")
        );
        assert_eq!(
            branch.lineage.branched_from_message_id.as_deref(),
            Some("message-2")
        );
        assert_eq!(branch.lineage.branch_depth, 1);
        assert_eq!(branch.snapshots.len(), 1);
        assert_eq!(branch.snapshots[0].message_id, "message-2");

        let cloned_messages = repo.list_messages(&branch.session.id).await.unwrap();
        assert_eq!(cloned_messages.len(), 2);
        assert_eq!(cloned_messages[0].content, "Summarize the release blockers");
        assert_eq!(
            cloned_messages[1].content,
            "The main blockers are notes and verification"
        );

        let loaded = repo
            .load_session_record(&branch.session.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            loaded.lineage.branch_snapshot_id.as_deref(),
            Some(branch.snapshots[0].id.as_str())
        );
    }
}
