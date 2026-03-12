use nuka_domain::{
    agent::{AgentArchetype, AgentPreset},
    tool::{AgentToolBinding, ToolAdapterKind, ToolCostClass},
};
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
        let archetype_json = encode_archetype(&agent.archetype)?;

        sqlx::query(
            r#"
            insert into agents (
              id, name, description, system_prompt, provider_id, archetype_json,
              knowledge_collection_ids, memory_scope_ids, created_at, updated_at
            )
            values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'), datetime('now'))
            on conflict(id) do update set
              name = excluded.name,
              description = excluded.description,
              system_prompt = excluded.system_prompt,
              provider_id = excluded.provider_id,
              archetype_json = excluded.archetype_json,
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
        .bind(archetype_json)
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
                r#"
                insert into agent_tool_bindings (
                  agent_id, tool_id, allowed, adapter_kind, purpose, cost_class
                )
                values (?1, ?2, ?3, ?4, ?5, ?6)
                "#,
            )
            .bind(agent.id.clone())
            .bind(binding.tool_id)
            .bind(binding.allowed as i64)
            .bind(adapter_kind_as_str(&binding.adapter_kind))
            .bind(binding.purpose)
            .bind(cost_class_as_str(&binding.cost_class))
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    pub async fn list(&self) -> anyhow::Result<Vec<AgentPreset>> {
        let rows = sqlx::query(
            "select id, name, description, system_prompt, provider_id, archetype_json, knowledge_collection_ids, memory_scope_ids from agents order by created_at asc",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut agents = Vec::with_capacity(rows.len());
        for row in rows {
            let id: String = row.get("id");
            let name: String = row.get("name");
            let description: String = row.get("description");
            let bindings = sqlx::query(
                r#"
                select tool_id, allowed, adapter_kind, purpose, cost_class
                from agent_tool_bindings
                where agent_id = ?1
                order by tool_id asc
                "#,
            )
            .bind(&id)
            .fetch_all(&self.pool)
            .await?
            .into_iter()
            .map(map_binding_row)
            .collect::<anyhow::Result<Vec<_>>>()?;

            agents.push(AgentPreset {
                id,
                name: name.clone(),
                description: description.clone(),
                system_prompt: row.get("system_prompt"),
                provider_id: row.get("provider_id"),
                archetype: decode_archetype(
                    &row.get::<String, _>("archetype_json"),
                    &name,
                    &description,
                )?,
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

fn map_binding_row(binding: sqlx::sqlite::SqliteRow) -> anyhow::Result<AgentToolBinding> {
    Ok(AgentToolBinding {
        tool_id: binding.get("tool_id"),
        allowed: binding.get::<i64, _>("allowed") != 0,
        adapter_kind: parse_adapter_kind(&binding.get::<String, _>("adapter_kind"))?,
        purpose: binding.get("purpose"),
        cost_class: parse_cost_class(&binding.get::<String, _>("cost_class"))?,
    })
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

fn encode_archetype(archetype: &AgentArchetype) -> anyhow::Result<String> {
    Ok(serde_json::to_string(archetype)?)
}

fn decode_archetype(
    value: &str,
    name: &str,
    description: &str,
) -> anyhow::Result<AgentArchetype> {
    if value.trim().is_empty() {
        Ok(AgentArchetype::inferred_from_agent(name, description))
    } else {
        Ok(serde_json::from_str(value)?)
    }
}

fn adapter_kind_as_str(kind: &ToolAdapterKind) -> &'static str {
    match kind {
        ToolAdapterKind::Mcp => "mcp",
        ToolAdapterKind::Cli => "cli",
        ToolAdapterKind::IntegratedAgent => "integrated_agent",
    }
}

fn parse_adapter_kind(kind: &str) -> anyhow::Result<ToolAdapterKind> {
    match kind {
        "mcp" => Ok(ToolAdapterKind::Mcp),
        "cli" => Ok(ToolAdapterKind::Cli),
        "integrated_agent" => Ok(ToolAdapterKind::IntegratedAgent),
        other => anyhow::bail!("unknown tool adapter kind: {other}"),
    }
}

fn cost_class_as_str(cost_class: &ToolCostClass) -> &'static str {
    match cost_class {
        ToolCostClass::Low => "low",
        ToolCostClass::Medium => "medium",
        ToolCostClass::High => "high",
    }
}

fn parse_cost_class(cost_class: &str) -> anyhow::Result<ToolCostClass> {
    match cost_class {
        "low" => Ok(ToolCostClass::Low),
        "medium" => Ok(ToolCostClass::Medium),
        "high" => Ok(ToolCostClass::High),
        other => anyhow::bail!("unknown tool cost class: {other}"),
    }
}
