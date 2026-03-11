use std::{path::PathBuf, sync::Arc};

use tauri::Manager;

const PAGEINDEX_RESOURCE_PATH: &str = "resources/pageindex/pageindex.cmd";

#[cfg(test)]
pub async fn build_app_state_for_test() -> anyhow::Result<crate::app_state::AppState> {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await?;

    build_app_state_from_pool(pool, test_pageindex_runtime_path()).await
}

pub async fn build_app_state<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> anyhow::Result<crate::app_state::AppState> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| anyhow::anyhow!(error.to_string()))?;

    std::fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("nuka-world.sqlite3");
    let pool = connect_persistent_pool(&db_path).await?;

    let pageindex_runtime = resolve_bundled_pageindex_runtime(app)?;

    build_app_state_from_pool(pool, pageindex_runtime).await
}

async fn build_app_state_from_pool(
    pool: sqlx::SqlitePool,
    pageindex_runtime: PathBuf,
) -> anyhow::Result<crate::app_state::AppState> {
    nuka_storage::migrations::run(&pool).await?;

    let settings_service = nuka_runtime::settings_service::SettingsService::new(pool.clone());
    let provider_service = nuka_runtime::providers::ProvidersService::new(pool.clone());
    let agents_service = nuka_runtime::agents::AgentsService::new(pool.clone());
    let knowledge_service = nuka_runtime::knowledge_service::KnowledgeService::new(
        pool.clone(),
        Arc::new(nuka_knowledge::pageindex::PageIndexEngine::new(
            pageindex_runtime.to_string_lossy().to_string(),
            nuka_knowledge::process_manager::FilesystemProcessManager,
        )),
    );
    let chat_service = nuka_runtime::chat_service::ChatService::new(pool.clone());
    let memory_service = nuka_runtime::memory_service::MemoryService::new(pool);
    let settings = settings_service.load().await?;
    let knowledge_health = knowledge_service.health().await;

    Ok(crate::app_state::AppState::new(
        crate::settings::SettingsState::from(&settings),
        crate::app_state::AppRuntimeStatus::new(
            crate::app_state::RuntimeCapabilityStatus::new(
                "bootstrapped",
                "Desktop runtime bootstrapped",
            ),
            knowledge_status(knowledge_health),
        ),
        provider_service,
        settings_service,
        agents_service,
        knowledge_service,
        memory_service,
        nuka_runtime::world::WorldRuntime::new(chat_service.clone()),
        nuka_runtime::workflow_world::WorkflowWorldRuntime::new(chat_service.clone()),
    ))
}

fn resolve_bundled_pageindex_runtime<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> anyhow::Result<PathBuf> {
    let bundled = app
        .path()
        .resolve(PAGEINDEX_RESOURCE_PATH, tauri::path::BaseDirectory::Resource)
        .map_err(|error| anyhow::anyhow!(error.to_string()))?;

    if bundled.exists() {
        return Ok(bundled);
    }

    Ok(test_pageindex_runtime_path())
}

fn test_pageindex_runtime_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(PAGEINDEX_RESOURCE_PATH)
}

fn knowledge_status(
    health: nuka_knowledge::engine::EngineHealth,
) -> crate::app_state::RuntimeCapabilityStatus {
    match health {
        nuka_knowledge::engine::EngineHealth::Ready { .. } => {
            crate::app_state::RuntimeCapabilityStatus::new("ready", "Knowledge ready")
        }
        nuka_knowledge::engine::EngineHealth::Unavailable { reason } => {
            crate::app_state::RuntimeCapabilityStatus::new("unavailable", reason)
        }
    }
}

async fn connect_persistent_pool(path: &PathBuf) -> anyhow::Result<sqlx::SqlitePool> {
    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true);

    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;

    Ok(pool)
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn connect_persistent_pool_creates_missing_sqlite_file() {
        let unique = format!(
            "nuka-world-bootstrap-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let dir = std::env::temp_dir().join(unique);
        let db_path = dir.join("nuka-world.sqlite3");

        std::fs::create_dir_all(&dir).unwrap();

        let pool = super::connect_persistent_pool(&db_path).await.unwrap();
        sqlx::query("select 1").execute(&pool).await.unwrap();

        assert!(db_path.exists());

        pool.close().await;
        std::fs::remove_file(&db_path).ok();
        std::fs::remove_dir_all(&dir).ok();
    }
}
