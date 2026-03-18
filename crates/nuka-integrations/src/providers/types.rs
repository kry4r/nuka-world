#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct OpenAiChatMessage {
    pub role: String,
    pub content: String,
}

impl OpenAiChatMessage {
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".to_string(),
            content: content.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct OpenAiChatCompletionRequest {
    pub model: String,
    pub messages: Vec<OpenAiChatMessage>,
    pub stream: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct OpenAiChatCompletionChoice {
    pub message: OpenAiChatMessage,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct OpenAiChatCompletionDelta {
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct OpenAiChatCompletionChunkChoice {
    #[serde(default)]
    pub delta: OpenAiChatCompletionDelta,
    #[serde(default)]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct OpenAiChatCompletionChunk {
    #[serde(default)]
    pub id: Option<String>,
    pub choices: Vec<OpenAiChatCompletionChunkChoice>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct OpenAiChatCompletionResponse {
    pub id: String,
    pub choices: Vec<OpenAiChatCompletionChoice>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedChatRequest {
    pub url: String,
    pub bearer_token: Option<String>,
    pub body: OpenAiChatCompletionRequest,
}
