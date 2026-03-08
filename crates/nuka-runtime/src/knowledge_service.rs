use std::{path::Path, sync::Arc};

use nuka_knowledge::engine::{EngineHealth, KnowledgeEngine};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnowledgeSearchResult {
    pub collection_id: String,
    pub collection_name: String,
    pub path: String,
    pub snippet: String,
}

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

    pub async fn add_local_folder_connector(
        &self,
        path: &str,
    ) -> anyhow::Result<nuka_domain::knowledge::KnowledgeCollection> {
        let name = Path::new(path)
            .file_name()
            .and_then(|segment| segment.to_str())
            .filter(|segment| !segment.is_empty())
            .unwrap_or(path)
            .to_string();
        let collection = nuka_domain::knowledge::KnowledgeCollection::local_folder(name, path.to_string());
        self.save_collection(collection.clone()).await?;
        Ok(collection)
    }

    pub async fn rebuild_collection(
        &self,
        collection_id: &str,
    ) -> anyhow::Result<nuka_storage::knowledge::KnowledgeIndexJobRecord> {
        nuka_storage::migrations::run(&self.pool).await?;
        let job = match self.health().await {
            EngineHealth::Ready { .. } => nuka_storage::knowledge::KnowledgeIndexJobRecord {
                id: uuid::Uuid::new_v4().to_string(),
                collection_id: collection_id.to_string(),
                status: "ready".to_string(),
                detail: Some("Index rebuilt".to_string()),
            },
            EngineHealth::Unavailable { reason } => nuka_storage::knowledge::KnowledgeIndexJobRecord {
                id: uuid::Uuid::new_v4().to_string(),
                collection_id: collection_id.to_string(),
                status: "failed".to_string(),
                detail: Some(reason),
            },
        };
        nuka_storage::knowledge::KnowledgeRepository::new(self.pool.clone())
            .record_index_job(job.clone())
            .await?;
        Ok(job)
    }

    pub async fn list_index_jobs(
        &self,
        collection_id: &str,
    ) -> anyhow::Result<Vec<nuka_storage::knowledge::KnowledgeIndexJobRecord>> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::knowledge::KnowledgeRepository::new(self.pool.clone())
            .list_index_jobs(collection_id)
            .await
    }

    pub async fn search(&self, query: &str) -> anyhow::Result<Vec<KnowledgeSearchResult>> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }

        match self.health().await {
            EngineHealth::Ready { .. } => {
                let needle = query.to_ascii_lowercase();
                let mut results = Vec::new();
                for collection in self.list_collections().await? {
                    let collection_name = collection.name.clone();
                    for connector in collection.connectors {
                        let nuka_domain::knowledge::KnowledgeConnectorKind::LocalFolder { path } = connector.kind;
                        if collection_name.to_ascii_lowercase().contains(&needle)
                            || path.to_ascii_lowercase().contains(&needle)
                        {
                            results.push(KnowledgeSearchResult {
                                collection_id: collection.id.clone(),
                                collection_name: collection_name.clone(),
                                path: path.clone(),
                                snippet: format!("Matched {query}"),
                            });
                        }
                    }
                }
                Ok(results)
            }
            EngineHealth::Unavailable { reason } => anyhow::bail!(reason),
        }
    }
}
