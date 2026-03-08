pub mod engine;
pub mod import;
pub mod library;
pub mod normalizer;
pub mod pageindex;
pub mod process_manager;

pub fn crate_name() -> &'static str {
    "nuka-knowledge"
}

#[cfg(test)]
mod tests {
    use crate::engine::{EngineHealth, KnowledgeEngine};
    use crate::normalizer::DocumentNormalizer;
    use crate::pageindex::PageIndexEngine;

    #[test]
    fn normalizer_accepts_supported_code_extensions() {
        assert!(DocumentNormalizer::supports_extension("tsx"));
        assert!(DocumentNormalizer::supports_extension("rs"));
        assert!(DocumentNormalizer::supports_extension("pdf"));
    }

    #[test]
    fn normalizer_rejects_unknown_extensions() {
        assert!(!DocumentNormalizer::supports_extension("exe"));
    }

    #[tokio::test]
    async fn pageindex_engine_reports_missing_runtime() {
        let engine = PageIndexEngine::new_for_test_missing_runtime();
        assert!(matches!(engine.health().await, EngineHealth::Unavailable { .. }));
    }
}
