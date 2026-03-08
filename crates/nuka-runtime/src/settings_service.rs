#[derive(Debug, Clone)]
pub struct SettingsService {
    pool: sqlx::SqlitePool,
}

pub fn test_pool() -> sqlx::SqlitePool {
    sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_lazy("sqlite::memory:")
        .expect("in-memory sqlite pool should be created")
}

impl SettingsService {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub fn new_for_test() -> Self {
        Self::new(test_pool())
    }

    pub async fn load(&self) -> anyhow::Result<nuka_storage::settings::DesktopSettings> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::settings::SettingsRepository::new(self.pool.clone())
            .load()
            .await
    }

    pub async fn save(&self, settings: &nuka_storage::settings::DesktopSettings) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::settings::SettingsRepository::new(self.pool.clone())
            .save(settings)
            .await
    }

    pub async fn load_state_value(&self, key: &str) -> anyhow::Result<Option<String>> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::runtime_state::RuntimeStateRepository::new(self.pool.clone())
            .get(key)
            .await
    }

    pub async fn save_state_value(&self, key: &str, value: &str) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::runtime_state::RuntimeStateRepository::new(self.pool.clone())
            .put(key, value)
            .await
    }
}
