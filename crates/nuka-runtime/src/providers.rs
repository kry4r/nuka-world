use std::{future::Future, pin::Pin, sync::Arc};

use nuka_domain::provider::{
    ProviderConfig, ProviderConnectionStatus, ProviderRouteRequest, ProviderRouteState,
    ProviderValidationError,
};
use nuka_integrations::providers::{types::OpenAiChatMessage, ChatCompletionProvider};

pub type ProviderSecretLoadFuture =
    Pin<Box<dyn Future<Output = anyhow::Result<Option<String>>> + Send>>;
pub type ProviderSecretLoader = dyn Fn(&str) -> ProviderSecretLoadFuture + Send + Sync;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedProviderRoute {
    pub provider: ProviderConfig,
    pub routing: ProviderRouteState,
}

#[derive(Clone)]
pub struct ProvidersService {
    pool: sqlx::SqlitePool,
    secret_loader: Arc<ProviderSecretLoader>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderPreferencesState {
    #[serde(default)]
    fallback_provider_id: String,
    #[serde(default = "default_connection_checks")]
    connection_checks: bool,
}

impl Default for ProviderPreferencesState {
    fn default() -> Self {
        Self {
            fallback_provider_id: String::new(),
            connection_checks: true,
        }
    }
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
        Ok(self.resolve_route(None).await?.provider)
    }

    pub async fn resolve_route(
        &self,
        request: Option<&ProviderRouteRequest>,
    ) -> anyhow::Result<ResolvedProviderRoute> {
        nuka_storage::migrations::run(&self.pool).await?;

        let settings = nuka_storage::settings::SettingsRepository::new(self.pool.clone())
            .load()
            .await?;
        let preferences = self.load_provider_preferences().await?;
        let providers = self.list_providers().await?;
        let requested_provider_id =
            normalize_optional(request.and_then(|value| value.requested_provider_id.as_deref()));
        let requested_model =
            normalize_optional(request.and_then(|value| value.requested_model.as_deref()));
        let primary_provider_id = requested_provider_id
            .clone()
            .or(settings.default_provider_id)
            .ok_or_else(|| anyhow::anyhow!("default provider is not configured"))?;
        let fallback_provider_id =
            normalize_optional(Some(preferences.fallback_provider_id.as_str()))
                .filter(|provider_id| provider_id != &primary_provider_id);
        let mut last_failure: Option<(String, anyhow::Error)> = None;

        for provider_id in [
            Some(primary_provider_id.clone()),
            fallback_provider_id.clone(),
        ]
        .into_iter()
        .flatten()
        {
            let candidate = match providers
                .iter()
                .find(|provider| provider.id == provider_id)
                .cloned()
            {
                Some(candidate) if candidate.enabled => candidate,
                Some(_) => {
                    last_failure = Some((
                        "provider_disabled".to_string(),
                        anyhow::anyhow!("provider is disabled: {provider_id}"),
                    ));
                    continue;
                }
                None => {
                    last_failure = Some((
                        "provider_unavailable".to_string(),
                        anyhow::anyhow!("provider not found: {provider_id}"),
                    ));
                    continue;
                }
            };
            let mut candidate = self.hydrate_provider(candidate).await?;
            if let Some(model) = requested_model.as_ref() {
                candidate.model = model.clone();
            }

            match self
                .prepare_candidate(&candidate, preferences.connection_checks)
                .await
            {
                Ok(()) => {
                    return Ok(ResolvedProviderRoute {
                        routing: ProviderRouteState {
                            requested_provider_id: requested_provider_id.clone(),
                            requested_model: requested_model.clone(),
                            effective_provider_id: candidate.id.clone(),
                            effective_model: candidate.model.clone(),
                            fallback_provider_id: fallback_provider_id.clone(),
                            failover_reason: if candidate.id == primary_provider_id {
                                None
                            } else {
                                last_failure.as_ref().map(|(reason, _)| reason.clone())
                            },
                        },
                        provider: candidate,
                    });
                }
                Err(failure) => {
                    last_failure = Some(failure);
                }
            }
        }

        match last_failure {
            Some((reason, error)) => {
                Err(error.context(format!("provider route resolution failed: {reason}")))
            }
            None => anyhow::bail!("default provider is not configured"),
        }
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
    ) -> anyhow::Result<ProviderConnectionStatus> {
        let provider = self.hydrate_provider(provider.clone()).await?;

        Ok(
            nuka_integrations::providers::openai::OpenAiCompatibleProvider::default()
                .test_connection(&provider)
                .await,
        )
    }

    async fn prepare_candidate(
        &self,
        provider: &ProviderConfig,
        connection_checks: bool,
    ) -> Result<(), (String, anyhow::Error)> {
        if let Err(errors) = provider.validate() {
            return Err((
                provider_validation_reason(&errors).to_string(),
                anyhow::anyhow!("invalid provider config: {:?}", errors),
            ));
        }

        nuka_integrations::providers::openai::OpenAiCompatibleProvider::default()
            .prepare_chat_request(
                provider,
                vec![OpenAiChatMessage::user("provider route check".to_string())],
            )
            .map_err(|error| ("invalid_url".to_string(), error))?;

        if connection_checks && !is_local_provider(&provider.base_url) {
            let status = self
                .test_provider_connection(provider)
                .await
                .map_err(|error| ("upstream_failure".to_string(), error))?;
            if !matches!(status, ProviderConnectionStatus::Ready) {
                return Err((
                    provider_connection_status_label(&status).to_string(),
                    anyhow::anyhow!(
                        "provider connection check failed: {}",
                        provider_connection_status_label(&status)
                    ),
                ));
            }
        }

        Ok(())
    }

    async fn hydrate_provider(
        &self,
        mut provider: ProviderConfig,
    ) -> anyhow::Result<ProviderConfig> {
        if provider.token.trim().is_empty() && provider.secret_present {
            if let Some(secret) = (self.secret_loader)(&provider.id).await? {
                provider.token = secret;
            }
        }

        Ok(provider)
    }

    async fn load_provider_preferences(&self) -> anyhow::Result<ProviderPreferencesState> {
        let value = nuka_storage::runtime_state::RuntimeStateRepository::new(self.pool.clone())
            .get("settings.providers")
            .await?;

        Ok(value
            .map(|serialized| serde_json::from_str(&serialized))
            .transpose()?
            .unwrap_or_default())
    }
}

fn empty_secret_loader(_provider_id: &str) -> ProviderSecretLoadFuture {
    Box::pin(async { Ok(None) })
}

fn normalize_optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn default_connection_checks() -> bool {
    true
}

fn provider_validation_reason(errors: &[ProviderValidationError]) -> &'static str {
    if errors
        .iter()
        .any(|error| matches!(error, ProviderValidationError::MissingModel))
    {
        "missing_model"
    } else if errors.iter().any(|error| {
        matches!(
            error,
            ProviderValidationError::MissingBaseUrl | ProviderValidationError::InvalidBaseUrl
        )
    }) {
        "invalid_url"
    } else {
        "invalid_provider"
    }
}

fn is_local_provider(base_url: &str) -> bool {
    base_url.contains("localhost") || base_url.contains("127.0.0.1")
}

fn provider_connection_status_label(status: &ProviderConnectionStatus) -> &'static str {
    match status {
        ProviderConnectionStatus::Unknown => "unknown",
        ProviderConnectionStatus::Ready => "ready",
        ProviderConnectionStatus::InvalidUrl => "invalid_url",
        ProviderConnectionStatus::InvalidToken => "invalid_token",
        ProviderConnectionStatus::MissingModel => "missing_model",
        ProviderConnectionStatus::UnreachableHost => "unreachable_host",
        ProviderConnectionStatus::Timeout => "timeout",
        ProviderConnectionStatus::UpstreamFailure => "upstream_failure",
    }
}
