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
        let collections = repository.list_collections().await?;

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
        let collection = self.load_collection(collection_id).await?;
        let job = match self.engine.rebuild(&collection).await {
            Ok(summary) => nuka_storage::knowledge::KnowledgeIndexJobRecord {
                id: uuid::Uuid::new_v4().to_string(),
                collection_id: collection_id.to_string(),
                status: "ready".to_string(),
                detail: Some(summary.detail),
            },
            Err(error) => nuka_storage::knowledge::KnowledgeIndexJobRecord {
                id: uuid::Uuid::new_v4().to_string(),
                collection_id: collection_id.to_string(),
                status: "failed".to_string(),
                detail: Some(error.to_string()),
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

        let collections = self.list_collections().await?;
        let hits = self.engine.search(&collections, query).await?;

        Ok(hits
            .into_iter()
            .filter_map(|hit| {
                collections
                    .iter()
                    .find(|collection| collection.id == hit.collection_id)
                    .map(|collection| KnowledgeSearchResult {
                        collection_id: collection.id.clone(),
                        collection_name: collection.name.clone(),
                        path: hit.path,
                        snippet: hit.snippet,
                    })
            })
            .collect())
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
    use std::{
        fs,
        path::PathBuf,
        sync::Arc,
        time::{SystemTime, UNIX_EPOCH},
    };

    use nuka_domain::knowledge::{KnowledgeCollection, KnowledgeConnector, KnowledgeConnectorKind};
    use nuka_knowledge::{pageindex::PageIndexEngine, process_manager::StubProcessManager};

    use super::KnowledgeService;

    fn service_with_ready_engine() -> KnowledgeService {
        KnowledgeService::new(
            crate::settings_service::test_pool(),
            Arc::new(PageIndexEngine::new(
                "pageindex",
                StubProcessManager::ready(),
            )),
        )
    }

    fn temp_fixture_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should move forward")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("nuka-runtime-{name}-{unique}"));
        fs::create_dir_all(&path).expect("fixture directory should be created");
        path
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
        let fixture_dir = temp_fixture_dir("disabled");
        let disabled_dir = fixture_dir.join("disabled");
        let enabled_dir = fixture_dir.join("enabled");
        fs::create_dir_all(&disabled_dir).unwrap();
        fs::create_dir_all(&enabled_dir).unwrap();
        fs::write(
            disabled_dir.join("notes.md"),
            "This disabled document mentions the release checklist.\n",
        )
        .unwrap();
        fs::write(
            enabled_dir.join("notes.md"),
            "This enabled document mentions the release checklist.\n",
        )
        .unwrap();

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
                            path: disabled_dir.to_string_lossy().replace('\\', "/"),
                        },
                        enabled: false,
                    },
                    KnowledgeConnector {
                        id: "connector-enabled".to_string(),
                        kind: KnowledgeConnectorKind::LocalFolder {
                            path: enabled_dir.to_string_lossy().replace('\\', "/"),
                        },
                        enabled: true,
                    },
                ],
                supported_extensions: library.supported_extensions,
            })
            .await
            .unwrap();

        let disabled_results = service.search("disabled document").await.unwrap();
        assert!(disabled_results.is_empty());

        let enabled_results = service.search("enabled document").await.unwrap();
        assert_eq!(enabled_results.len(), 1);
        assert!(enabled_results[0].path.ends_with("/enabled/notes.md"));
    }

    #[tokio::test]
    async fn search_returns_indexed_snippets_instead_of_connector_path_matches() {
        let service = service_with_ready_engine();
        let fixture_dir = temp_fixture_dir("search");
        let fixture_path = fixture_dir.join("notes.md");
        fs::write(
            &fixture_path,
            "The release checklist should be reviewed before every handoff.\n",
        )
        .unwrap();

        let library = service
            .list_collections()
            .await
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        service
            .add_local_folder_connector(&library.id, &fixture_dir.to_string_lossy())
            .await
            .unwrap();
        service.rebuild_collection(&library.id).await.unwrap();

        let results = service.search("release checklist").await.unwrap();

        assert!(results
            .iter()
            .any(|result| result.snippet.contains("release checklist")));
    }
}
