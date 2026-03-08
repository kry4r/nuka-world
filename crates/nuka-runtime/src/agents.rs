#[derive(Debug, Clone)]
pub struct AgentsService {
    pool: sqlx::SqlitePool,
}

impl AgentsService {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub fn new_for_test() -> Self {
        Self::new(crate::settings_service::test_pool())
    }

    pub async fn save_agent(&self, agent: nuka_domain::agent::AgentPreset) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::agents::AgentRepository::new(self.pool.clone())
            .upsert(agent)
            .await
    }

    pub async fn list_agents(&self) -> anyhow::Result<Vec<nuka_domain::agent::AgentPreset>> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::agents::AgentRepository::new(self.pool.clone())
            .list()
            .await
    }

    pub async fn delete_agent(&self, agent_id: &str) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::agents::AgentRepository::new(self.pool.clone())
            .delete(agent_id)
            .await
    }
}
