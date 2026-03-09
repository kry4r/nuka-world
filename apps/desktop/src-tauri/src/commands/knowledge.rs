use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeLibraryResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub engine: KnowledgeEngineSummaryResponse,
    pub connectors: Vec<KnowledgeConnectorResponse>,
    pub supported_extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeConnectorResponse {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEngineSummaryResponse {
    pub id: String,
    pub label: String,
    pub health: String,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeIndexJobResponse {
    pub id: String,
    pub collection_id: String,
    pub status: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSearchResultResponse {
    pub collection_id: String,
    pub collection_name: String,
    pub path: String,
    pub snippet: String,
}


#[tauri::command]
pub fn default_knowledge_library() -> KnowledgeLibraryResponse {
    let library = nuka_knowledge::library::KnowledgeLibrary::user_default();

    KnowledgeLibraryResponse {
        id: library.id,
        name: library.name,
        description: String::new(),
        engine: KnowledgeEngineSummaryResponse::from(
            nuka_domain::knowledge::KnowledgeEngineSummary::for_engine(
                nuka_domain::knowledge::PAGEINDEX_ENGINE_ID,
                "unknown",
            ),
        ),
        connectors: Vec::new(),
        supported_extensions: nuka_domain::knowledge::LOCAL_FOLDER_SUPPORTED_EXTENSIONS
            .iter()
            .map(|extension| extension.to_string())
            .collect(),
    }
}

#[tauri::command]
pub async fn list_knowledge_libraries(
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<Vec<KnowledgeLibraryResponse>, String> {
    list_knowledge_libraries_inner(&state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn add_folder_connector(
    collection_id: String,
    path: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<KnowledgeLibraryResponse, String> {
    add_folder_connector_inner(collection_id, path, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn rebuild_knowledge_library(
    collection_id: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<KnowledgeIndexJobResponse, String> {
    rebuild_knowledge_library_inner(collection_id, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn list_index_jobs(
    collection_id: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<Vec<KnowledgeIndexJobResponse>, String> {
    list_index_jobs_inner(collection_id, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn search_knowledge(
    query: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<Vec<KnowledgeSearchResultResponse>, String> {
    search_knowledge_inner(query, &state)
        .await
        .map_err(|error| error.to_string())
}

async fn list_knowledge_libraries_inner(
    state: &crate::app_state::AppState,
) -> anyhow::Result<Vec<KnowledgeLibraryResponse>> {
    let collections = state.knowledge_service().list_collections().await?;
    let mut libraries = Vec::with_capacity(collections.len());

    for collection in collections {
        let engine = state
            .knowledge_service()
            .summarize_engine(&collection.engine)
            .await;
        libraries.push(KnowledgeLibraryResponse::from_parts(collection, engine));
    }

    Ok(libraries)
}

async fn add_folder_connector_inner(
    collection_id: String,
    path: String,
    state: &crate::app_state::AppState,
) -> anyhow::Result<KnowledgeLibraryResponse> {
    let collection = state
        .knowledge_service()
        .add_local_folder_connector(&collection_id, &path)
        .await?;
    let engine = state
        .knowledge_service()
        .summarize_engine(&collection.engine)
        .await;

    Ok(KnowledgeLibraryResponse::from_parts(collection, engine))
}

async fn rebuild_knowledge_library_inner(
    collection_id: String,
    state: &crate::app_state::AppState,
) -> anyhow::Result<KnowledgeIndexJobResponse> {
    Ok(KnowledgeIndexJobResponse::from(
        state
            .knowledge_service()
            .rebuild_collection(&collection_id)
            .await?,
    ))
}

async fn list_index_jobs_inner(
    collection_id: String,
    state: &crate::app_state::AppState,
) -> anyhow::Result<Vec<KnowledgeIndexJobResponse>> {
    Ok(state
        .knowledge_service()
        .list_index_jobs(&collection_id)
        .await?
        .into_iter()
        .map(KnowledgeIndexJobResponse::from)
        .collect())
}

async fn search_knowledge_inner(
    query: String,
    state: &crate::app_state::AppState,
) -> anyhow::Result<Vec<KnowledgeSearchResultResponse>> {
    Ok(state
        .knowledge_service()
        .search(&query)
        .await?
        .into_iter()
        .map(KnowledgeSearchResultResponse::from)
        .collect())
}

impl KnowledgeLibraryResponse {
    fn from_parts(
        value: nuka_domain::knowledge::KnowledgeCollection,
        engine: nuka_domain::knowledge::KnowledgeEngineSummary,
    ) -> Self {
        Self {
            id: value.id,
            name: value.name,
            description: value.description,
            engine: KnowledgeEngineSummaryResponse::from(engine),
            connectors: value
                .connectors
                .into_iter()
                .map(KnowledgeConnectorResponse::from)
                .collect(),
            supported_extensions: value.supported_extensions,
        }
    }
}

impl From<nuka_domain::knowledge::KnowledgeConnector> for KnowledgeConnectorResponse {
    fn from(value: nuka_domain::knowledge::KnowledgeConnector) -> Self {
        let (kind, path) = match value.kind {
            nuka_domain::knowledge::KnowledgeConnectorKind::LocalFolder { path } => {
                ("local_folder".to_string(), path)
            }
        };

        Self {
            id: value.id,
            kind,
            label: connector_label(&path),
            path,
            enabled: value.enabled,
        }
    }
}

impl From<nuka_domain::knowledge::KnowledgeEngineSummary> for KnowledgeEngineSummaryResponse {
    fn from(value: nuka_domain::knowledge::KnowledgeEngineSummary) -> Self {
        Self {
            id: value.id,
            label: value.label,
            health: value.health,
            capabilities: value.capabilities,
        }
    }
}

impl From<nuka_storage::knowledge::KnowledgeIndexJobRecord> for KnowledgeIndexJobResponse {
    fn from(value: nuka_storage::knowledge::KnowledgeIndexJobRecord) -> Self {
        Self {
            id: value.id,
            collection_id: value.collection_id,
            status: value.status,
            detail: value.detail,
        }
    }
}

impl From<nuka_runtime::knowledge_service::KnowledgeSearchResult> for KnowledgeSearchResultResponse {
    fn from(value: nuka_runtime::knowledge_service::KnowledgeSearchResult) -> Self {
        Self {
            collection_id: value.collection_id,
            collection_name: value.collection_name,
            path: value.path,
            snippet: value.snippet,
        }
    }
}

fn connector_label(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .and_then(|segment| segment.to_str())
        .filter(|segment| !segment.is_empty())
        .map(|segment| segment.to_string())
        .unwrap_or_else(|| "Local folder".to_string())
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn knowledge_lists_default_library_when_no_connector_exists() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let libraries = super::list_knowledge_libraries_inner(&state).await.unwrap();
        assert_eq!(libraries.len(), 1);
        assert_eq!(libraries[0].id, "knowledge-base");
        assert!(libraries[0].connectors.is_empty());
    }

    #[tokio::test]
    async fn knowledge_adds_folder_connector_into_existing_library() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let library = super::list_knowledge_libraries_inner(&state)
            .await
            .unwrap()
            .into_iter()
            .next()
            .unwrap();

        let library = super::add_folder_connector_inner(
            library.id.clone(),
            "C:/docs/rust".to_string(),
            &state,
        )
        .await
        .unwrap();

        assert_eq!(library.connectors[0].path, "C:/docs/rust");

        let library = super::add_folder_connector_inner(
            library.id.clone(),
            "C:/docs/rust-book".to_string(),
            &state,
        )
        .await
        .unwrap();

        assert_eq!(library.connectors.len(), 2);
        let libraries = super::list_knowledge_libraries_inner(&state).await.unwrap();
        assert_eq!(libraries.len(), 1);
        assert_eq!(libraries[0].id, library.id);
        assert_eq!(libraries[0].connectors.len(), 2);
    }

    #[tokio::test]
    async fn knowledge_normalizes_duplicate_folder_connectors_in_same_library() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let library = super::list_knowledge_libraries_inner(&state)
            .await
            .unwrap()
            .into_iter()
            .next()
            .unwrap();

        let library = super::add_folder_connector_inner(
            library.id.clone(),
            "C:\\Docs\\Rust\\".to_string(),
            &state,
        )
        .await
        .unwrap();

        let library = super::add_folder_connector_inner(
            library.id.clone(),
            "c:/docs/rust".to_string(),
            &state,
        )
        .await
        .unwrap();

        assert_eq!(library.connectors.len(), 1);
        assert_eq!(library.connectors[0].path, "C:/Docs/Rust");
    }

    #[tokio::test]
    async fn knowledge_adds_folder_connector_with_explicit_engine_summary() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let library = super::list_knowledge_libraries_inner(&state)
            .await
            .unwrap()
            .into_iter()
            .next()
            .unwrap();

        let library = super::add_folder_connector_inner(
            library.id.clone(),
            "C:/docs/rust".to_string(),
            &state,
        )
        .await
        .unwrap();

        assert_eq!(library.engine.id, "pageindex");
        assert_eq!(library.engine.label, "PageIndex");
        assert!(matches!(library.engine.health.as_str(), "healthy" | "unavailable"));
        assert!(library
            .engine
            .capabilities
            .contains(&"indexing".to_string()));
        assert!(library
            .engine
            .capabilities
            .contains(&"retrieval".to_string()));
    }

    #[tokio::test]
    async fn knowledge_rebuild_records_index_job_state() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let library = super::list_knowledge_libraries_inner(&state)
            .await
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        let library = super::add_folder_connector_inner(
            library.id.clone(),
            "C:/docs/rust".to_string(),
            &state,
        )
        .await
        .unwrap();

        super::rebuild_knowledge_library_inner(library.id.clone(), &state)
            .await
            .unwrap();
        let jobs = super::list_index_jobs_inner(library.id, &state).await.unwrap();

        assert_eq!(jobs.len(), 1);
        assert!(!jobs[0].status.is_empty());
    }

    #[tokio::test]
    async fn knowledge_rebuild_rejects_unknown_library_and_records_no_job() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();

        let error = super::rebuild_knowledge_library_inner(
            "missing-library".to_string(),
            &state,
        )
        .await
        .unwrap_err();

        assert!(error
            .to_string()
            .contains("knowledge library not found: missing-library"));

        let jobs = super::list_index_jobs_inner("missing-library".to_string(), &state)
            .await
            .unwrap();
        assert!(jobs.is_empty());
    }

    #[tokio::test]
    async fn knowledge_library_response_distinguishes_engine_and_source_metadata() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let library = super::list_knowledge_libraries_inner(&state)
            .await
            .unwrap()
            .into_iter()
            .next()
            .unwrap();

        let library = super::add_folder_connector_inner(
            library.id.clone(),
            "C:/docs/rust".to_string(),
            &state,
        )
        .await
        .unwrap();

        assert_eq!(library.connectors.len(), 1);
        assert_eq!(library.connectors[0].path, "C:/docs/rust");
        assert_eq!(library.connectors[0].kind, "local_folder");
        assert_ne!(library.engine.id, library.connectors[0].id);
        assert_ne!(library.engine.label, library.connectors[0].path);
    }
}

