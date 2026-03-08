use std::{path::PathBuf, sync::Arc};

use tauri::Manager;

#[cfg(test)]
pub async fn build_app_state_for_test() -> anyhow::Result<crate::app_state::AppState> {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await?;

    build_app_state_from_pool(pool).await
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
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&sqlite_url(&db_path))
        .await?;

    build_app_state_from_pool(pool).await
}

async fn build_app_state_from_pool(
    pool: sqlx::SqlitePool,
) -> anyhow::Result<crate::app_state::AppState> {
    nuka_storage::migrations::run(&pool).await?;

    let settings_service = nuka_runtime::settings_service::SettingsService::new(pool.clone());
    let provider_service = nuka_runtime::providers::ProvidersService::new(pool.clone());
    let agents_service = nuka_runtime::agents::AgentsService::new(pool.clone());
    let knowledge_service = nuka_runtime::knowledge_service::KnowledgeService::new(
        pool.clone(),
        Arc::new(nuka_knowledge::pageindex::PageIndexEngine::default()),
    );
    let memory_service = nuka_runtime::memory_service::MemoryService::new(pool);
    let settings = settings_service.load().await?;

    Ok(crate::app_state::AppState::new(
        crate::settings::SettingsState::from(&settings),
        provider_service,
        settings_service,
        agents_service,
        knowledge_service,
        memory_service,
        nuka_runtime::world::WorldRuntime::default(),
        nuka_runtime::workflow_world::WorkflowWorldRuntime::default(),
    ))
}

fn sqlite_url(path: &PathBuf) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    format!("sqlite://{normalized}")
}
