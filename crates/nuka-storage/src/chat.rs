use nuka_domain::chat::{ChatMessage, ChatMessageRole, ChatSessionSummary};
use sqlx::Row;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatSessionCompaction {
    pub id: String,
    pub session_id: String,
    pub summary: String,
    pub compacted_message_count: usize,
    pub created_at: String,
}

pub struct ChatRepository {
    pool: sqlx::SqlitePool,
}

impl ChatRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create_session(&self, session: ChatSessionSummary) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            insert into chat_sessions (id, title, provider_id, workflow_id, message_count, created_at)
            values (?1, ?2, ?3, ?4, ?5, datetime('now'))
            on conflict(id) do update set
              title = excluded.title,
              provider_id = excluded.provider_id,
              workflow_id = excluded.workflow_id,
              message_count = excluded.message_count
            "#,
        )
        .bind(session.id)
        .bind(session.title)
        .bind(session.provider_id)
        .bind(session.workflow_id)
        .bind(session.message_count as i64)
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
        let rows = sqlx::query(
            "select id, title, provider_id, workflow_id, message_count from chat_sessions order by created_at asc",
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| ChatSessionSummary {
                id: row.get("id"),
                title: row.get("title"),
                provider_id: row.get("provider_id"),
                workflow_id: row.get("workflow_id"),
                message_count: row.get::<i64, _>("message_count") as usize,
            })
            .collect())
    }

    pub async fn compact_messages(
        &self,
        session_id: &str,
        message_ids: &[String],
        summary: &str,
    ) -> anyhow::Result<()> {
        if message_ids.is_empty() {
            return Ok(());
        }

        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            insert into chat_session_compactions (
              id, session_id, summary, compacted_message_count, created_at
            )
            values (?1, ?2, ?3, ?4, datetime('now'))
            "#,
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(session_id)
        .bind(summary)
        .bind(message_ids.len() as i64)
        .execute(&mut *tx)
        .await?;

        for message_id in message_ids {
            sqlx::query("delete from chat_messages where session_id = ?1 and id = ?2")
                .bind(session_id)
                .bind(message_id)
                .execute(&mut *tx)
                .await?;
        }

        let visible_count: i64 = sqlx::query_scalar(
            r#"
            select
              (select count(*) from chat_messages where session_id = ?1) +
              (select count(*) from chat_session_compactions where session_id = ?1)
            "#,
        )
        .bind(session_id)
        .fetch_one(&mut *tx)
        .await?;

        sqlx::query("update chat_sessions set message_count = ?2 where id = ?1")
            .bind(session_id)
            .bind(visible_count)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }

    pub async fn list_compactions(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Vec<ChatSessionCompaction>> {
        let rows = sqlx::query(
            r#"
            select id, session_id, summary, compacted_message_count, created_at
            from chat_session_compactions
            where session_id = ?1
            order by created_at asc, rowid asc
            "#,
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| ChatSessionCompaction {
                id: row.get("id"),
                session_id: row.get("session_id"),
                summary: row.get("summary"),
                compacted_message_count: row.get::<i64, _>("compacted_message_count") as usize,
                created_at: row.get("created_at"),
            })
            .collect())
    }

    pub async fn list_live_messages(&self, session_id: &str) -> anyhow::Result<Vec<ChatMessage>> {
        let rows = sqlx::query(
            "select id, session_id, role, content from chat_messages where session_id = ?1 order by created_at asc",
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(map_message).collect()
    }

    pub async fn list_messages(&self, session_id: &str) -> anyhow::Result<Vec<ChatMessage>> {
        let mut messages = self
            .list_compactions(session_id)
            .await?
            .into_iter()
            .map(|compaction| ChatMessage {
                id: compaction.id,
                session_id: compaction.session_id,
                role: ChatMessageRole::System,
                content: compaction.summary,
            })
            .collect::<Vec<_>>();
        messages.extend(self.list_live_messages(session_id).await?);
        Ok(messages)
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
