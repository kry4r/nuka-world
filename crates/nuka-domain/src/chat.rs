#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChatMessageRole {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatMessage {
    pub id: String,
    pub session_id: String,
    pub role: ChatMessageRole,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatSessionSummary {
    pub id: String,
    pub title: String,
    pub provider_id: Option<String>,
    pub workflow_id: Option<String>,
    pub message_count: usize,
    pub routing: Option<crate::provider::ProviderRouteState>,
}
