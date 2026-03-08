#[derive(Debug, Clone)]
pub struct MemoryService {
    pool: sqlx::SqlitePool,
}

impl MemoryService {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub fn new_for_test() -> Self {
        Self::new(crate::settings_service::test_pool())
    }

    pub async fn save_scope(&self, scope: nuka_domain::memory::MemoryScope) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::memory::MemoryScopeRepository::new(self.pool.clone())
            .upsert(scope)
            .await
    }

    pub async fn list_scopes(&self) -> anyhow::Result<Vec<nuka_domain::memory::MemoryScope>> {
        self.list_all().await
    }

    pub async fn get_scope(
        &self,
        scope_id: &str,
    ) -> anyhow::Result<Option<nuka_domain::memory::MemoryScope>> {
        Ok(self
            .list_all()
            .await?
            .into_iter()
            .find(|scope| scope.id == scope_id))
    }

    pub async fn list_by_workflow(
        &self,
        workflow_id: &str,
    ) -> anyhow::Result<Vec<nuka_domain::memory::MemoryScope>> {
        let items = self.list_all().await?;
        Ok(items
            .into_iter()
            .filter(|scope| scope.workflow_id.as_deref() == Some(workflow_id))
            .collect())
    }

    pub async fn list_by_session(
        &self,
        session_id: &str,
    ) -> anyhow::Result<Vec<nuka_domain::memory::MemoryScope>> {
        let items = self.list_all().await?;
        Ok(items
            .into_iter()
            .filter(|scope| scope.session_id.as_deref() == Some(session_id))
            .collect())
    }

    pub async fn list_by_agent(
        &self,
        agent_id: &str,
    ) -> anyhow::Result<Vec<nuka_domain::memory::MemoryScope>> {
        let items = self.list_all().await?;
        Ok(items
            .into_iter()
            .filter(|scope| scope.agent_id.as_deref() == Some(agent_id))
            .collect())
    }

    async fn list_all(&self) -> anyhow::Result<Vec<nuka_domain::memory::MemoryScope>> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::memory::MemoryScopeRepository::new(self.pool.clone())
            .list()
            .await
    }
}
