use std::{future::Future, pin::Pin, sync::Arc};

use nuka_domain::provider::ProviderConfig;
use nuka_integrations::providers::ChatCompletionProvider;

pub type ProviderSecretLoadFuture =
    Pin<Box<dyn Future<Output = anyhow::Result<Option<String>>> + Send>>;
pub type ProviderSecretLoader = dyn Fn(&str) -> ProviderSecretLoadFuture + Send + Sync;

#[derive(Clone)]
pub struct ProvidersService {
    pool: sqlx::SqlitePool,
    secret_loader: Arc<ProviderSecretLoader>,
}

impl std::fmt::Debug for ProvidersService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ProvidersService")
            .field("pool", &self.pool)
            .finish_non_exhaustive()
    }
}

impl ProvidersService {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self::new_with_secret_loader(pool, Arc::new(empty_secret_loader))
    }

    pub fn new_with_secret_loader(
        pool: sqlx::SqlitePool,
        secret_loader: Arc<ProviderSecretLoader>,
    ) -> Self {
        Self {
            pool,
            secret_loader,
        }
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

        let mut provider = self
            .list_providers()
            .await?
            .into_iter()
            .find(|provider| provider.id == default_provider_id)
            .ok_or_else(|| anyhow::anyhow!("default provider not found: {default_provider_id}"))?;

        if provider.token.trim().is_empty() && provider.secret_present {
            if let Some(secret) = (self.secret_loader)(&provider.id).await? {
                provider.token = secret;
            }
        }

        Ok(provider)
    }

    pub async fn delete_provider(&self, provider_id: &str) -> anyhow::Result<()> {
        nuka_storage::migrations::run(&self.pool).await?;
        nuka_storage::providers::ProviderRepository::new(self.pool.clone())
            .delete(provider_id)
            .await
    }

    pub async fn current_timestamp(&self) -> anyhow::Result<String> {
        nuka_storage::migrations::run(&self.pool).await?;
        sqlx::query_scalar("select datetime('now')")
            .fetch_one(&self.pool)
            .await
            .map_err(Into::into)
    }

    pub async fn test_provider_connection(
        &self,
        provider: &ProviderConfig,
    ) -> anyhow::Result<nuka_domain::provider::ProviderConnectionStatus> {
        let mut provider = provider.clone();
        if provider.token.trim().is_empty() && provider.secret_present {
            if let Some(secret) = (self.secret_loader)(&provider.id).await? {
                provider.token = secret;
            }
        }

        Ok(
            nuka_integrations::providers::openai::OpenAiCompatibleProvider::default()
                .test_connection(&provider)
                .await,
        )
    }
}

fn empty_secret_loader(_provider_id: &str) -> ProviderSecretLoadFuture {
    Box::pin(async { Ok(None) })
}
