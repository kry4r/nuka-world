use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeLibraryResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub engine: String,
    pub connectors: Vec<KnowledgeConnectorResponse>,
    pub supported_extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeConnectorResponse {
    pub id: String,
    pub kind: String,
    pub path: String,
    pub enabled: bool,
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
        engine: "pageindex".to_string(),
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
    path: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<KnowledgeLibraryResponse, String> {
    add_folder_connector_inner(path, &state)
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
    Ok(state
        .knowledge_service()
        .list_collections()
        .await?
        .into_iter()
        .map(KnowledgeLibraryResponse::from)
        .collect())
}

async fn add_folder_connector_inner(
    path: String,
    state: &crate::app_state::AppState,
) -> anyhow::Result<KnowledgeLibraryResponse> {
    Ok(KnowledgeLibraryResponse::from(
        state
            .knowledge_service()
            .add_local_folder_connector(&path)
            .await?,
    ))
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

impl From<nuka_domain::knowledge::KnowledgeCollection> for KnowledgeLibraryResponse {
    fn from(value: nuka_domain::knowledge::KnowledgeCollection) -> Self {
        Self {
            id: value.id,
            name: value.name,
            description: value.description,
            engine: value.engine,
            connectors: value.connectors.into_iter().map(KnowledgeConnectorResponse::from).collect(),
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
            path,
            enabled: value.enabled,
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

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn knowledge_lists_empty_libraries_when_no_connector_exists() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let libraries = super::list_knowledge_libraries_inner(&state).await.unwrap();
        assert!(libraries.is_empty());
    }

    #[tokio::test]
    async fn knowledge_adds_folder_connector_and_lists_it() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();

        let library = super::add_folder_connector_inner(
            "C:/docs/rust".to_string(),
            &state,
        )
        .await
        .unwrap();

        assert_eq!(library.connectors[0].path, "C:/docs/rust");

        let libraries = super::list_knowledge_libraries_inner(&state).await.unwrap();
        assert_eq!(libraries.len(), 1);
    }

    #[tokio::test]
    async fn knowledge_rebuild_records_index_job_state() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let library = super::add_folder_connector_inner(
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
}

