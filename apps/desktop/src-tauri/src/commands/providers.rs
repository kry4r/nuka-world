use crate::app_state::AppState;
use nuka_domain::provider::{ProviderConfig, ProviderConnectionStatus, ProviderKind};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRegistryResponse {
    pub count: usize,
    pub names: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRecord {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
    pub local: bool,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInput {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderConnectionResponse {
    pub kind: String,
}

#[tauri::command]
pub fn provider_registry() -> ProviderRegistryResponse {
    let registry = nuka_integrations::providers::ProviderRegistry::default();

    ProviderRegistryResponse {
        count: registry.len(),
        names: registry.names(),
    }
}

#[tauri::command]
pub async fn list_providers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ProviderRecord>, String> {
    list_providers_inner(&state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn save_provider(
    provider: ProviderInput,
    state: tauri::State<'_, AppState>,
) -> Result<ProviderRecord, String> {
    save_provider_inner(&state, provider)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_provider(
    provider_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    delete_provider_inner(&state, &provider_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn test_provider_connection(
    provider: ProviderInput,
    state: tauri::State<'_, AppState>,
) -> Result<ProviderConnectionResponse, String> {
    test_provider_connection_inner(&state, provider)
        .await
        .map_err(|error| error.to_string())
}

async fn list_providers_inner(state: &AppState) -> anyhow::Result<Vec<ProviderRecord>> {
    Ok(state
        .provider_service()
        .list_providers()
        .await?
        .into_iter()
        .map(ProviderRecord::from)
        .collect())
}

async fn save_provider_inner(
    state: &AppState,
    provider: ProviderInput,
) -> anyhow::Result<ProviderRecord> {
    let provider = provider.into_config();
    state
        .provider_service()
        .save_provider(provider.clone())
        .await?;
    Ok(ProviderRecord::from(provider))
}

async fn delete_provider_inner(state: &AppState, provider_id: &str) -> anyhow::Result<()> {
    state.provider_service().delete_provider(provider_id).await
}

async fn test_provider_connection_inner(
    state: &AppState,
    provider: ProviderInput,
) -> anyhow::Result<ProviderConnectionResponse> {
    let status = state
        .provider_service()
        .test_provider_connection(&provider.into_config())
        .await?;

    Ok(ProviderConnectionResponse {
        kind: provider_connection_status_kind(&status).to_string(),
    })
}

impl ProviderInput {
    fn into_config(self) -> ProviderConfig {
        ProviderConfig {
            id: normalize_provider_id(&self.id, &self.name),
            name: self.name,
            kind: ProviderKind::OpenAiCompatible,
            base_url: self.base_url,
            token: self.api_key,
            model: self.model,
            enabled: self.enabled,
        }
    }
}

impl From<ProviderConfig> for ProviderRecord {
    fn from(value: ProviderConfig) -> Self {
        let base_url = value.base_url;

        Self {
            id: value.id,
            name: value.name,
            model: value.model,
            api_key: value.token,
            local: is_local_provider(&base_url),
            enabled: value.enabled,
            base_url,
        }
    }
}

fn normalize_provider_id(id: &str, name: &str) -> String {
    let trimmed = id.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }

    let slug = name
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|character| if character.is_ascii_alphanumeric() { character } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();

    if slug.is_empty() {
        "provider-openai-compatible".to_string()
    } else {
        format!("provider-{slug}")
    }
}

fn is_local_provider(base_url: &str) -> bool {
    let normalized = base_url.to_ascii_lowercase();
    normalized.contains("localhost") || normalized.contains("127.0.0.1")
}

fn provider_connection_status_kind(status: &ProviderConnectionStatus) -> &'static str {
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

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn provider_list_returns_saved_providers() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();

        super::save_provider_inner(
            &state,
            super::ProviderInput {
                id: "provider-local".to_string(),
                name: "Local".to_string(),
                base_url: "http://localhost:11434/v1".to_string(),
                api_key: String::new(),
                model: "gpt-oss".to_string(),
                enabled: true,
            },
        )
        .await
        .unwrap();

        let items = super::list_providers_inner(&state).await.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "Local");
    }

    #[tokio::test]
    async fn provider_test_connection_rejects_missing_model() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();

        let status = super::test_provider_connection_inner(
            &state,
            super::ProviderInput {
                id: "provider-local".to_string(),
                name: "Local".to_string(),
                base_url: "http://localhost:11434/v1".to_string(),
                api_key: String::new(),
                model: String::new(),
                enabled: true,
            },
        )
        .await
        .unwrap();

        assert_eq!(status.kind, "missing_model");
    }
}
