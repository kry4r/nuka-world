pub mod openai;
pub mod types;

#[async_trait::async_trait]
pub trait ChatCompletionProvider: Send + Sync {
    fn provider_id(&self) -> &'static str;

    fn prepare_chat_request(
        &self,
        config: &nuka_domain::provider::ProviderConfig,
        messages: Vec<crate::providers::types::OpenAiChatMessage>,
    ) -> anyhow::Result<crate::providers::types::PreparedChatRequest>;

    async fn test_connection(
        &self,
        config: &nuka_domain::provider::ProviderConfig,
    ) -> nuka_domain::provider::ProviderConnectionStatus;
}

#[cfg(test)]
mod tests {
    use crate::providers::openai::{build_chat_completions_url, OpenAiCompatibleProvider};
    use crate::providers::types::OpenAiChatMessage;
    use crate::providers::ChatCompletionProvider;

    #[test]
    fn openai_client_builds_chat_completions_endpoint() {
        let endpoint = build_chat_completions_url("http://localhost:11434/v1").unwrap();
        assert_eq!(endpoint, "http://localhost:11434/v1/chat/completions");
    }

    #[test]
    fn openai_client_shapes_minimal_chat_request() {
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Local",
            "http://localhost:11434/v1",
            "",
            "gpt-oss",
        );

        let request = OpenAiCompatibleProvider::default()
            .prepare_chat_request(&provider, vec![OpenAiChatMessage::user("hello world")])
            .unwrap();

        assert_eq!(request.url, "http://localhost:11434/v1/chat/completions");
        assert_eq!(request.body.model, "gpt-oss");
        assert_eq!(request.body.messages[0].role, "user");
        assert_eq!(request.body.messages[0].content, "hello world");
    }
}
