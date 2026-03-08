use nuka_domain::{agent::AgentPreset, tool::AgentToolBinding};
use sqlx::Row;

pub struct AgentRepository {
    pool: sqlx::SqlitePool,
}

impl AgentRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert(&self, agent: AgentPreset) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            insert into agents (
              id, name, description, system_prompt, provider_id,
              knowledge_collection_ids, memory_scope_ids, created_at, updated_at
            )
            values (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), datetime('now'))
            on conflict(id) do update set
              name = excluded.name,
              description = excluded.description,
              system_prompt = excluded.system_prompt,
              provider_id = excluded.provider_id,
              knowledge_collection_ids = excluded.knowledge_collection_ids,
              memory_scope_ids = excluded.memory_scope_ids,
              updated_at = datetime('now')
            "#,
        )
        .bind(agent.id.clone())
        .bind(agent.name)
        .bind(agent.description)
        .bind(agent.system_prompt)
        .bind(agent.provider_id)
        .bind(encode_list(&agent.knowledge_collection_ids))
        .bind(encode_list(&agent.memory_scope_ids))
        .execute(&mut *tx)
        .await?;

        sqlx::query("delete from agent_tool_bindings where agent_id = ?1")
            .bind(agent.id.clone())
            .execute(&mut *tx)
            .await?;

        for binding in agent.tool_bindings {
            sqlx::query(
                "insert into agent_tool_bindings (agent_id, tool_id, allowed) values (?1, ?2, ?3)",
            )
            .bind(agent.id.clone())
            .bind(binding.tool_id)
            .bind(binding.allowed as i64)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    pub async fn list(&self) -> anyhow::Result<Vec<AgentPreset>> {
        let rows = sqlx::query(
            "select id, name, description, system_prompt, provider_id, knowledge_collection_ids, memory_scope_ids from agents order by created_at asc",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut agents = Vec::with_capacity(rows.len());
        for row in rows {
            let id: String = row.get("id");
            let bindings = sqlx::query(
                "select tool_id, allowed from agent_tool_bindings where agent_id = ?1 order by tool_id asc",
            )
            .bind(&id)
            .fetch_all(&self.pool)
            .await?
            .into_iter()
            .map(|binding| AgentToolBinding {
                tool_id: binding.get("tool_id"),
                allowed: binding.get::<i64, _>("allowed") != 0,
            })
            .collect();

            agents.push(AgentPreset {
                id,
                name: row.get("name"),
                description: row.get("description"),
                system_prompt: row.get("system_prompt"),
                provider_id: row.get("provider_id"),
                knowledge_collection_ids: decode_list(&row.get::<String, _>("knowledge_collection_ids")),
                memory_scope_ids: decode_list(&row.get::<String, _>("memory_scope_ids")),
                tool_bindings: bindings,
            });
        }

        Ok(agents)
    }

    pub async fn delete(&self, agent_id: &str) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;

        sqlx::query("delete from agent_tool_bindings where agent_id = ?1")
            .bind(agent_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("delete from agents where id = ?1")
            .bind(agent_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }
}

fn encode_list(items: &[String]) -> String {
    items.join("\n")
}

fn decode_list(items: &str) -> Vec<String> {
    if items.is_empty() {
        Vec::new()
    } else {
        items.split('\n').map(str::to_string).collect()
    }
}
