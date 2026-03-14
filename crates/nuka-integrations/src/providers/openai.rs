use crate::providers::{types::*, ChatCompletionProvider};
use anyhow::Context;
use nuka_domain::provider::{
    ProviderConfig, ProviderConnectionStatus, ProviderValidationError,
};

pub const PROVIDER_ID: &str = "openai_compatible";
const DESKTOP_USER_AGENT: &str = "nuka-world-desktop/0.1";

#[derive(Debug, Clone)]
pub struct OpenAiCompatibleProvider {
    client: reqwest::Client,
}

impl Default for OpenAiCompatibleProvider {
    fn default() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(default_request_timeout())
                .user_agent(DESKTOP_USER_AGENT)
                .build()
                .expect("openai-compatible reqwest client should build"),
        }
    }
}

#[async_trait::async_trait]
impl ChatCompletionProvider for OpenAiCompatibleProvider {
    fn provider_id(&self) -> &'static str {
        PROVIDER_ID
    }

    fn prepare_chat_request(
        &self,
        config: &ProviderConfig,
        messages: Vec<OpenAiChatMessage>,
    ) -> anyhow::Result<PreparedChatRequest> {
        if let Err(errors) = config.validate() {
            anyhow::bail!("invalid provider config: {:?}", errors);
        }

        Ok(PreparedChatRequest {
            url: build_chat_completions_url(&config.base_url)?,
            bearer_token: if config.token.trim().is_empty() {
                None
            } else {
                Some(config.token.clone())
            },
            body: OpenAiChatCompletionRequest {
                model: config.model.clone(),
                messages,
                stream: false,
            },
        })
    }

    async fn test_connection(&self, config: &ProviderConfig) -> ProviderConnectionStatus {
        if let Err(errors) = config.validate() {
            return classify_validation_errors(&errors);
        }

        let prepared = match self.prepare_chat_request(config, vec![OpenAiChatMessage::user("ping")]) {
            Ok(prepared) => prepared,
            Err(_) => return ProviderConnectionStatus::InvalidUrl,
        };

        let mut request = self.client.post(&prepared.url).json(&prepared.body);
        if let Some(token) = prepared.bearer_token {
            request = request.bearer_auth(token);
        }

        let response = match request.send().await {
            Ok(response) => response,
            Err(error) if error.is_timeout() => return ProviderConnectionStatus::Timeout,
            Err(error) if error.is_connect() => return ProviderConnectionStatus::UnreachableHost,
            Err(_) => return ProviderConnectionStatus::UpstreamFailure,
        };

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let body = response.text().await.unwrap_or_default();
            return classify_http_failure(status, &body);
        }

        match response
            .json::<OpenAiChatCompletionResponse>()
            .await
            .context("failed to parse OpenAI-compatible chat completion response")
        {
            Ok(_) => ProviderConnectionStatus::Ready,
            Err(_) => ProviderConnectionStatus::UpstreamFailure,
        }
    }
}

impl OpenAiCompatibleProvider {
    pub async fn complete_chat(
        &self,
        config: &ProviderConfig,
        messages: Vec<OpenAiChatMessage>,
    ) -> anyhow::Result<OpenAiChatCompletionResponse> {
        let prepared = self.prepare_chat_request(config, messages)?;

        let mut request = self.client.post(&prepared.url).json(&prepared.body);
        if let Some(token) = prepared.bearer_token {
            request = request.bearer_auth(token);
        }

        let response = request.send().await?;
        let response = response.error_for_status()?;
        Ok(response.json().await?)
    }
}

pub fn build_chat_completions_url(base_url: &str) -> anyhow::Result<String> {
    let trimmed = base_url.trim();
    if trimmed.is_empty() {
        anyhow::bail!("missing base url");
    }

    let mut url = url::Url::parse(trimmed)?;
    if !matches!(url.scheme(), "http" | "https") {
        anyhow::bail!("unsupported provider scheme: {}", url.scheme());
    }

    let normalized_path = url.path().trim_end_matches('/');
    let next_path = if normalized_path.ends_with("/chat/completions") {
        normalized_path.to_string()
    } else if normalized_path.is_empty() {
        "/chat/completions".to_string()
    } else {
        format!("{normalized_path}/chat/completions")
    };

    url.set_path(&next_path);
    url.set_query(None);

    Ok(url.to_string().trim_end_matches('/').to_string())
}

fn default_request_timeout() -> std::time::Duration {
    std::time::Duration::from_secs(60)
}

fn classify_validation_errors(errors: &[ProviderValidationError]) -> ProviderConnectionStatus {
    if errors.iter().any(|error| matches!(error, ProviderValidationError::MissingModel)) {
        ProviderConnectionStatus::MissingModel
    } else {
        ProviderConnectionStatus::InvalidUrl
    }
}

fn classify_http_failure(status: u16, body: &str) -> ProviderConnectionStatus {
    match status {
        400 if body.to_ascii_lowercase().contains("model") => ProviderConnectionStatus::MissingModel,
        401 | 403 => ProviderConnectionStatus::InvalidToken,
        404 => ProviderConnectionStatus::InvalidUrl,
        408 | 504 => ProviderConnectionStatus::Timeout,
        500..=599 => ProviderConnectionStatus::UpstreamFailure,
        _ => ProviderConnectionStatus::UpstreamFailure,
    }
}

#[cfg(test)]
mod tests {
    use crate::providers::ChatCompletionProvider;
    use std::io::{Read, Write};

    #[test]
    fn default_request_timeout_supports_real_team_generation_requests() {
        assert_eq!(
            super::default_request_timeout(),
            std::time::Duration::from_secs(60)
        );
    }

    #[tokio::test]
    async fn test_connection_sends_a_desktop_user_agent() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();

        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();

            let mut buffer = [0_u8; 8192];
            let bytes_read = stream.read(&mut buffer).unwrap();
            let request = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
            let has_expected_user_agent =
                request.to_ascii_lowercase().contains("user-agent: nuka-world-desktop/0.1");
            let body = if has_expected_user_agent {
                r#"{"id":"test","choices":[{"message":{"role":"assistant","content":"pong"}}]}"#
            } else {
                r#"{"error":"missing user agent"}"#
            };
            let status_line = if has_expected_user_agent {
                "HTTP/1.1 200 OK"
            } else {
                "HTTP/1.1 500 Internal Server Error"
            };
            let response = format!(
                "{status_line}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                body.len()
            );

            stream.write_all(response.as_bytes()).unwrap();
            stream.flush().unwrap();
        });

        let config = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Local Probe",
            format!("http://{address}/v1"),
            "sk-local",
            "test-model",
        );
        let status = super::OpenAiCompatibleProvider::default()
            .test_connection(&config)
            .await;

        server.join().unwrap();

        assert_eq!(status, nuka_domain::provider::ProviderConnectionStatus::Ready);
    }
}
