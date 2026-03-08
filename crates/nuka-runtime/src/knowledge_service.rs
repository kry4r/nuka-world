use std::sync::Arc;

use nuka_knowledge::engine::{EngineHealth, KnowledgeEngine};

#[derive(Clone)]
pub struct KnowledgeService {
    pool: sqlx::SqlitePool,
    engine: Arc<dyn KnowledgeEngine>,
}

impl std::fmt::Debug for KnowledgeService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("KnowledgeService").finish_non_exhaustive()
    }
}

impl KnowledgeService {
    pub fn new(pool: sqlx::SqlitePool, engine: Arc<dyn KnowledgeEngine>) -> Self {
        Self { pool, engine }
    }

    pub fn new_for_test_missing_engine() -> Self {
        Self::new(
            crate::settings_service::test_pool(),
            Arc::new(nuka_knowledge::pageindex::PageIndexEngine::new_for_test_missing_runtime()),
        )
    }

    pub async fn health(&self) -> EngineHealth {
        self.engine.health().await
    }

    pub async fn save_collection(
        &self,
        collection: nuka_domain::knowledge::KnowledgeCollection,
    ) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::knowledge::KnowledgeRepository::new(self.pool.clone())
            .upsert_collection(collection)
            .await
    }

    pub async fn list_collections(
        &self,
    ) -> anyhow::Result<Vec<nuka_domain::knowledge::KnowledgeCollection>> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::knowledge::KnowledgeRepository::new(self.pool.clone())
            .list_collections()
            .await
    }
}
