#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderKind {
    OpenAiCompatible,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderConnectionStatus {
    Unknown,
    Ready,
    InvalidUrl,
    InvalidToken,
    MissingModel,
    UnreachableHost,
    Timeout,
    UpstreamFailure,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderValidationError {
    MissingName,
    MissingBaseUrl,
    InvalidBaseUrl,
    MissingModel,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRouteRequest {
    pub requested_provider_id: Option<String>,
    pub requested_model: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRouteState {
    pub requested_provider_id: Option<String>,
    pub requested_model: Option<String>,
    pub effective_provider_id: String,
    pub effective_model: String,
    pub fallback_provider_id: Option<String>,
    pub failover_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub kind: ProviderKind,
    pub base_url: String,
    pub token: String,
    pub model: String,
    pub enabled: bool,
    pub secret_ref: Option<String>,
    pub secret_present: bool,
    pub secret_updated_at: Option<String>,
}

impl ProviderConfig {
    pub fn openai_compatible(
        name: impl Into<String>,
        base_url: impl Into<String>,
        token: impl Into<String>,
        model: impl Into<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.into(),
            kind: ProviderKind::OpenAiCompatible,
            base_url: base_url.into(),
            token: token.into(),
            model: model.into(),
            enabled: true,
            secret_ref: None,
            secret_present: false,
            secret_updated_at: None,
        }
    }

    pub fn validate(&self) -> Result<(), Vec<ProviderValidationError>> {
        let mut errors = Vec::new();

        if self.name.trim().is_empty() {
            errors.push(ProviderValidationError::MissingName);
        }

        if self.base_url.trim().is_empty() {
            errors.push(ProviderValidationError::MissingBaseUrl);
        } else if !self.base_url.starts_with("http://") && !self.base_url.starts_with("https://") {
            errors.push(ProviderValidationError::InvalidBaseUrl);
        }

        if self.model.trim().is_empty() {
            errors.push(ProviderValidationError::MissingModel);
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
}
