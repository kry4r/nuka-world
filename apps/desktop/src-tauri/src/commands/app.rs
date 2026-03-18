use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCapabilityStatusResponse {
    pub kind: String,
    pub message: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatusResponse {
    pub provider: RuntimeCapabilityStatusResponse,
    pub knowledge: RuntimeCapabilityStatusResponse,
    pub app: RuntimeCapabilityStatusResponse,
}

#[tauri::command]
pub fn close_policy_minimizes_to_tray(state: tauri::State<'_, crate::app_state::AppState>) -> bool {
    let settings = state.settings();
    crate::tray::ClosePolicy::from_settings(&settings).minimize_to_tray
}

#[tauri::command]
pub async fn app_runtime_status(
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<RuntimeStatusResponse, String> {
    app_runtime_status_inner(&state)
        .await
        .map_err(|error| error.to_string())
}

pub async fn app_runtime_status_inner(
    state: &crate::app_state::AppState,
) -> anyhow::Result<RuntimeStatusResponse> {
    let runtime_status = state.runtime_status();
    let settings = state.settings_service().load().await?;
    let providers = state.provider_service().list_providers().await?;
    let provider = match settings.default_provider_id.as_ref() {
        None => RuntimeCapabilityStatusResponse {
            kind: "missing".to_string(),
            message: "Provider required".to_string(),
            label: None,
        },
        Some(default_provider_id) => match providers
            .into_iter()
            .find(|provider| provider.id == *default_provider_id)
        {
            None => RuntimeCapabilityStatusResponse {
                kind: "degraded".to_string(),
                message: "Default provider is unavailable".to_string(),
                label: None,
            },
            Some(provider) if !provider.enabled => RuntimeCapabilityStatusResponse {
                kind: "degraded".to_string(),
                message: "Default provider is disabled".to_string(),
                label: Some(provider.name),
            },
            Some(provider) if provider.validate().is_err() => RuntimeCapabilityStatusResponse {
                kind: "degraded".to_string(),
                message: "Default provider configuration is invalid".to_string(),
                label: Some(provider.name),
            },
            Some(provider) => RuntimeCapabilityStatusResponse {
                kind: "ready".to_string(),
                message: "Default provider configured".to_string(),
                label: Some(provider.name),
            },
        },
    };

    Ok(RuntimeStatusResponse {
        provider,
        knowledge: RuntimeCapabilityStatusResponse::from(runtime_status.knowledge()),
        app: RuntimeCapabilityStatusResponse::from(runtime_status.app()),
    })
}

impl From<&crate::app_state::RuntimeCapabilityStatus> for RuntimeCapabilityStatusResponse {
    fn from(value: &crate::app_state::RuntimeCapabilityStatus) -> Self {
        Self {
            kind: value.kind().to_string(),
            message: value.message().to_string(),
            label: None,
        }
    }
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn app_runtime_status_reports_provider_missing_but_knowledge_ready() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let status = super::app_runtime_status_inner(&state).await.unwrap();

        assert_eq!(status.provider.kind, "missing");
        assert_eq!(status.provider.label, None);
        assert_eq!(status.knowledge.kind, "ready");
    }

    #[tokio::test]
    async fn app_runtime_status_includes_default_provider_label_when_configured() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Local Provider",
            "http://localhost:11434/v1",
            "token",
            "gpt-oss",
        );
        let provider_id = provider.id.clone();

        state
            .provider_service()
            .save_provider(provider)
            .await
            .unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let status = super::app_runtime_status_inner(&state).await.unwrap();

        assert_eq!(status.provider.kind, "ready");
        assert_eq!(status.provider.label.as_deref(), Some("Local Provider"));
    }

    #[tokio::test]
    async fn app_runtime_status_uses_the_selected_default_provider_label() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let provider_a = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Provider A",
            "http://localhost:11434/v1",
            "",
            "gpt-oss",
        );
        let provider_b = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Provider B",
            "http://localhost:22434/v1",
            "",
            "gpt-oss",
        );
        let provider_b_id = provider_b.id.clone();

        state
            .provider_service()
            .save_provider(provider_a)
            .await
            .unwrap();
        state
            .provider_service()
            .save_provider(provider_b)
            .await
            .unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_b_id)
            .await
            .unwrap();

        let status = super::app_runtime_status_inner(&state).await.unwrap();

        assert_eq!(status.provider.label.as_deref(), Some("Provider B"));
    }

    #[tokio::test]
    async fn app_runtime_status_reports_configured_remote_provider_without_route_preflight() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Remote Provider",
            "https://api.invalid/v1",
            "sk-test",
            "MiniMax-M2.5",
        );
        let provider_id = provider.id.clone();

        state
            .provider_service()
            .save_provider(provider)
            .await
            .unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let status = super::app_runtime_status_inner(&state).await.unwrap();

        assert_eq!(status.provider.kind, "ready");
        assert_eq!(status.provider.label.as_deref(), Some("Remote Provider"));
    }
}
