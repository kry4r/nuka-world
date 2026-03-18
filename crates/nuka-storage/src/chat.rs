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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatSessionSnapshot {
    pub id: String,
    pub session_id: String,
    pub anchor_message_id: String,
    pub title: String,
    pub message_count: usize,
    pub created_at: String,
}

#[derive(Debug, Clone)]
struct StoredChatSession {
    summary: ChatSessionSummary,
    branch_root_session_id: Option<String>,
}

pub struct ChatRepository {
    pool: sqlx::SqlitePool,
}

impl ChatRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create_session(&self, session: ChatSessionSummary) -> anyhow::Result<()> {
        let route_json = encode_optional_json(session.routing.as_ref())?;
        sqlx::query(
            r#"
            insert into chat_sessions (
              id, title, provider_id, route_json, workflow_id, message_count, created_at
            )
            values (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
            on conflict(id) do update set
              title = excluded.title,
              provider_id = excluded.provider_id,
              route_json = excluded.route_json,
              workflow_id = excluded.workflow_id,
              message_count = excluded.message_count
            "#,
        )
        .bind(session.id)
        .bind(session.title)
        .bind(session.provider_id)
        .bind(route_json)
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
            "select id, title, provider_id, route_json, workflow_id, message_count from chat_sessions order by created_at asc",
        )
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|row| {
                Ok(ChatSessionSummary {
                    id: row.get("id"),
                    title: row.get("title"),
                    provider_id: row.get("provider_id"),
                    routing: decode_optional_json(row.get("route_json"))?,
                    workflow_id: row.get("workflow_id"),
                    message_count: row.get::<i64, _>("message_count") as usize,
                })
            })
            .collect()
    }

    pub async fn list_snapshots(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Vec<ChatSessionSnapshot>> {
        let rows = sqlx::query(
            r#"
            select id, session_id, anchor_message_id, title, message_count, created_at
            from chat_session_snapshots
            where session_id = ?1
            order by created_at asc, rowid asc
            "#,
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| ChatSessionSnapshot {
                id: row.get("id"),
                session_id: row.get("session_id"),
                anchor_message_id: row.get("anchor_message_id"),
                title: row.get("title"),
                message_count: row.get::<i64, _>("message_count") as usize,
                created_at: row.get("created_at"),
            })
            .collect())
    }

    pub async fn branch_from_anchor(
        &self,
        session_id: &str,
        anchor_message_id: &str,
    ) -> anyhow::Result<(ChatSessionSnapshot, String)> {
        let source = self
            .load_stored_session(session_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("unknown chat session: {session_id}"))?;
        let visible_messages = self.list_messages(session_id).await?;
        let anchor_index = visible_messages
            .iter()
            .position(|message| message.id == anchor_message_id)
            .ok_or_else(|| anyhow::anyhow!("unknown chat anchor: {anchor_message_id}"))?;
        let snapshot = ChatSessionSnapshot {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            anchor_message_id: anchor_message_id.to_string(),
            title: snapshot_title(&visible_messages[anchor_index]),
            message_count: anchor_index + 1,
            created_at: current_timestamp(&self.pool).await?,
        };
        let branch_session_id = uuid::Uuid::new_v4().to_string();
        let branch_title = format!(
            "{} / Branch {}",
            source.summary.title,
            self.next_branch_number(session_id).await?
        );
        let branch_root_session_id = source
            .branch_root_session_id
            .unwrap_or_else(|| source.summary.id.clone());
        let mut tx = self.pool.begin().await?;
        let route_json = encode_optional_json(source.summary.routing.as_ref())?;

        sqlx::query(
            r#"
            insert into chat_session_snapshots (
              id, session_id, anchor_message_id, title, message_count, created_at
            )
            values (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
        )
        .bind(snapshot.id.clone())
        .bind(snapshot.session_id.clone())
        .bind(snapshot.anchor_message_id.clone())
        .bind(snapshot.title.clone())
        .bind(snapshot.message_count as i64)
        .bind(snapshot.created_at.clone())
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            insert into chat_sessions (
              id, title, provider_id, route_json, workflow_id, branch_root_session_id,
              branch_parent_session_id, branch_source_snapshot_id, branch_anchor_message_id,
              message_count, created_at
            )
            values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
        )
        .bind(branch_session_id.clone())
        .bind(branch_title)
        .bind(source.summary.provider_id)
        .bind(route_json)
        .bind(source.summary.workflow_id)
        .bind(branch_root_session_id)
        .bind(source.summary.id)
        .bind(snapshot.id.clone())
        .bind(snapshot.anchor_message_id.clone())
        .bind(snapshot.message_count as i64)
        .bind(snapshot.created_at.clone())
        .execute(&mut *tx)
        .await?;

        for message in visible_messages.into_iter().take(snapshot.message_count) {
            sqlx::query(
                r#"
                insert into chat_messages (id, session_id, role, content, created_at)
                values (?1, ?2, ?3, ?4, datetime('now'))
                "#,
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(branch_session_id.clone())
            .bind(role_as_str(&message.role))
            .bind(message.content)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok((snapshot, branch_session_id))
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
            "select id, session_id, role, content from chat_messages where session_id = ?1 order by created_at asc, rowid asc",
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

    async fn load_stored_session(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Option<StoredChatSession>> {
        let row = sqlx::query(
            r#"
            select
              id,
              title,
              provider_id,
              route_json,
              workflow_id,
              message_count,
              branch_root_session_id
            from chat_sessions
            where id = ?1
            limit 1
            "#,
        )
        .bind(session_id)
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(row) => Ok(Some(StoredChatSession {
                summary: ChatSessionSummary {
                    id: row.get("id"),
                    title: row.get("title"),
                    provider_id: row.get("provider_id"),
                    routing: decode_optional_json(row.get("route_json"))?,
                    workflow_id: row.get("workflow_id"),
                    message_count: row.get::<i64, _>("message_count") as usize,
                },
                branch_root_session_id: row.get("branch_root_session_id"),
            })),
            None => Ok(None),
        }
    }

    async fn next_branch_number(&self, session_id: &str) -> anyhow::Result<i64> {
        let count: i64 = sqlx::query_scalar(
            "select count(*) from chat_sessions where branch_parent_session_id = ?1",
        )
        .bind(session_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(count + 1)
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

async fn current_timestamp(pool: &sqlx::SqlitePool) -> anyhow::Result<String> {
    Ok(sqlx::query_scalar("select datetime('now')")
        .fetch_one(pool)
        .await?)
}

fn snapshot_title(message: &ChatMessage) -> String {
    format!(
        "{}: {}",
        chat_role_label(&message.role),
        excerpt(&message.content, 48)
    )
}

fn chat_role_label(role: &ChatMessageRole) -> &'static str {
    match role {
        ChatMessageRole::System => "System",
        ChatMessageRole::User => "User",
        ChatMessageRole::Assistant => "Assistant",
        ChatMessageRole::Tool => "Tool",
    }
}

fn excerpt(content: &str, max_chars: usize) -> String {
    let mut excerpt = content.trim().chars().take(max_chars).collect::<String>();
    if content.chars().count() > max_chars {
        excerpt.push_str("...");
    }
    excerpt
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

fn encode_optional_json<T: serde::Serialize>(value: Option<&T>) -> anyhow::Result<Option<String>> {
    value
        .map(serde_json::to_string)
        .transpose()
        .map_err(Into::into)
}

fn decode_optional_json<T: serde::de::DeserializeOwned>(
    value: Option<String>,
) -> anyhow::Result<Option<T>> {
    value
        .map(|serialized| serde_json::from_str(&serialized))
        .transpose()
        .map_err(Into::into)
}
