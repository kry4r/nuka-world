use std::sync::Arc;

use nuka_knowledge::engine::{EngineCapabilities, EngineHealth, KnowledgeEngine};

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

    pub async fn summarize_engine(
        &self,
        engine_id: &str,
    ) -> nuka_domain::knowledge::KnowledgeEngineSummary {
        let normalized_engine_id = nuka_domain::knowledge::normalize_engine_id(engine_id);

        if normalized_engine_id == self.engine.id() {
            return nuka_domain::knowledge::KnowledgeEngineSummary {
                id: normalized_engine_id,
                label: nuka_domain::knowledge::engine_label(self.engine.id()),
                health: engine_health_label(self.health().await),
                capabilities: engine_capability_labels(self.engine.capabilities()),
            };
        }

        nuka_domain::knowledge::KnowledgeEngineSummary::for_engine(normalized_engine_id, "unknown")
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
        let repository = nuka_storage::knowledge::KnowledgeRepository::new(self.pool.clone());
        let collections = repository
            .list_collections()
            .await?;

        if collections.is_empty() {
            let collection = nuka_domain::knowledge::KnowledgeCollection::user_default();
            repository.upsert_collection(collection.clone()).await?;
            return Ok(vec![collection]);
        }

        Ok(collections)
    }

    pub async fn add_local_folder_connector(
        &self,
        collection_id: &str,
        path: &str,
    ) -> anyhow::Result<nuka_domain::knowledge::KnowledgeCollection> {
        let mut collection = self.load_collection(collection_id).await?;
        collection.add_local_folder_connector(path.to_string());
        self.save_collection(collection.clone()).await?;
        Ok(collection)
    }

    pub async fn rebuild_collection(
        &self,
        collection_id: &str,
    ) -> anyhow::Result<nuka_storage::knowledge::KnowledgeIndexJobRecord> {
        nuka_storage::migrations::run(&self.pool).await?;
        self.load_collection(collection_id).await?;
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
                        if !connector.enabled {
                            continue;
                        }

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

    async fn load_collection(
        &self,
        collection_id: &str,
    ) -> anyhow::Result<nuka_domain::knowledge::KnowledgeCollection> {
        self.list_collections()
            .await?
            .into_iter()
            .find(|collection| collection.id == collection_id)
            .ok_or_else(|| anyhow::anyhow!("knowledge library not found: {collection_id}"))
    }
}

fn engine_health_label(health: EngineHealth) -> String {
    match health {
        EngineHealth::Ready { .. } => "healthy".to_string(),
        EngineHealth::Unavailable { .. } => "unavailable".to_string(),
    }
}

fn engine_capability_labels(capabilities: EngineCapabilities) -> Vec<String> {
    let mut labels = Vec::new();

    if capabilities.local_folder_connectors {
        labels.push("local-folder-connectors".to_string());
    }
    if capabilities.indexing {
        labels.push("indexing".to_string());
    }
    if capabilities.retrieval {
        labels.push("retrieval".to_string());
    }

    labels
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use nuka_domain::knowledge::{
        KnowledgeCollection, KnowledgeConnector, KnowledgeConnectorKind,
    };
    use nuka_knowledge::{pageindex::PageIndexEngine, process_manager::StubProcessManager};

    use super::KnowledgeService;

    fn service_with_ready_engine() -> KnowledgeService {
        KnowledgeService::new(
            crate::settings_service::test_pool(),
            Arc::new(PageIndexEngine::new("pageindex", StubProcessManager::ready())),
        )
    }

    #[tokio::test]
    async fn add_local_folder_connector_appends_to_existing_library() {
        let service = service_with_ready_engine();
        let library = service
            .list_collections()
            .await
            .unwrap()
            .into_iter()
            .next()
            .unwrap();

        let library = service
            .add_local_folder_connector(&library.id, "C:/docs/rust")
            .await
            .unwrap();
        assert_eq!(library.connectors.len(), 1);

        let library = service
            .add_local_folder_connector(&library.id, "C:/docs/rust-book")
            .await
            .unwrap();

        assert_eq!(library.connectors.len(), 2);

        let collections = service.list_collections().await.unwrap();
        assert_eq!(collections.len(), 1);
        assert_eq!(collections[0].connectors.len(), 2);
    }

    #[tokio::test]
    async fn add_local_folder_connector_normalizes_duplicate_paths_in_same_library() {
        let service = service_with_ready_engine();
        let library = service
            .list_collections()
            .await
            .unwrap()
            .into_iter()
            .next()
            .unwrap();

        let library = service
            .add_local_folder_connector(&library.id, "C:\\Docs\\Rust\\")
            .await
            .unwrap();
        let library = service
            .add_local_folder_connector(&library.id, "c:/docs/rust")
            .await
            .unwrap();

        assert_eq!(library.connectors.len(), 1);
        let KnowledgeConnectorKind::LocalFolder { path } = &library.connectors[0].kind;
        assert_eq!(path, "C:/Docs/Rust");
    }

    #[tokio::test]
    async fn rebuild_collection_rejects_unknown_library() {
        let service = service_with_ready_engine();

        let error = service
            .rebuild_collection("missing-library")
            .await
            .unwrap_err();

        assert!(error
            .to_string()
            .contains("knowledge library not found: missing-library"));

        let jobs = service.list_index_jobs("missing-library").await.unwrap();
        assert!(jobs.is_empty());
    }

    #[tokio::test]
    async fn search_skips_disabled_connectors() {
        let service = service_with_ready_engine();
        let library = service
            .list_collections()
            .await
            .unwrap()
            .into_iter()
            .next()
            .unwrap();

        service
            .save_collection(KnowledgeCollection {
                id: library.id,
                name: library.name,
                description: library.description,
                engine: library.engine,
                connectors: vec![
                    KnowledgeConnector {
                        id: "connector-disabled".to_string(),
                        kind: KnowledgeConnectorKind::LocalFolder {
                            path: "C:/docs/disabled-dir".to_string(),
                        },
                        enabled: false,
                    },
                    KnowledgeConnector {
                        id: "connector-enabled".to_string(),
                        kind: KnowledgeConnectorKind::LocalFolder {
                            path: "C:/docs/enabled-dir".to_string(),
                        },
                        enabled: true,
                    },
                ],
                supported_extensions: library.supported_extensions,
            })
            .await
            .unwrap();

        let disabled_results = service.search("disabled-dir").await.unwrap();
        assert!(disabled_results.is_empty());

        let enabled_results = service.search("enabled-dir").await.unwrap();
        assert_eq!(enabled_results.len(), 1);
        assert_eq!(enabled_results[0].path, "C:/docs/enabled-dir");
    }
}
