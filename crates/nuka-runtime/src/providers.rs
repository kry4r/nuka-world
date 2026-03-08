use nuka_domain::provider::ProviderConfig;

#[derive(Debug, Clone)]
pub struct ProvidersService {
    pool: sqlx::SqlitePool,
}

impl ProvidersService {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub fn new_for_test() -> Self {
        Self::new(crate::settings_service::test_pool())
    }

    pub async fn save_provider(&self, provider: ProviderConfig) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::providers::ProviderRepository::new(self.pool.clone())
            .upsert(provider)
            .await
    }

    pub async fn list_providers(&self) -> anyhow::Result<Vec<ProviderConfig>> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::providers::ProviderRepository::new(self.pool.clone())
            .list()
            .await
    }

    pub async fn set_default_provider(&self, provider_id: &str) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        let repo = nuka_storage::settings::SettingsRepository::new(self.pool.clone());
        let mut settings = repo.load().await?;
        settings.default_provider_id = Some(provider_id.to_string());
        repo.save(&settings).await
    }

    pub async fn resolve_default_provider(&self) -> anyhow::Result<ProviderConfig> {
        nuka_storage::migrations::run(&self.pool).await?;
        let settings = nuka_storage::settings::SettingsRepository::new(self.pool.clone())
            .load()
            .await?;
        let default_provider_id = settings
            .default_provider_id
            .ok_or_else(|| anyhow::anyhow!("default provider is not configured"))?;

        self.list_providers()
            .await?
            .into_iter()
            .find(|provider| provider.id == default_provider_id)
            .ok_or_else(|| anyhow::anyhow!("default provider not found: {default_provider_id}"))
    }
}
