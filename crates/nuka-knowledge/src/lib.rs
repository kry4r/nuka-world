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
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::engine::{EngineHealth, KnowledgeEngine};
    use crate::normalizer::DocumentNormalizer;
    use crate::pageindex::PageIndexEngine;
    use crate::process_manager::StubProcessManager;

    fn temp_fixture_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should move forward")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("nuka-knowledge-{name}-{unique}"));
        fs::create_dir_all(&path).expect("fixture directory should be created");
        path
    }

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
        assert!(matches!(
            engine.health().await,
            EngineHealth::Unavailable { .. }
        ));
    }

    #[tokio::test]
    async fn pageindex_engine_searches_document_content() {
        let fixture_dir = temp_fixture_dir("search");
        let fixture_path = fixture_dir.join("release-notes.md");
        fs::write(
            &fixture_path,
            "# Release\n\nFollow the release checklist before handoff.\n",
        )
        .unwrap();

        let mut collection = nuka_domain::knowledge::KnowledgeCollection::user_default();
        collection.add_local_folder_connector(fixture_dir.to_string_lossy().to_string());

        let engine = PageIndexEngine::new("pageindex", StubProcessManager::ready());
        let hits = engine
            .search(&[collection], "release checklist")
            .await
            .unwrap();

        assert!(hits
            .iter()
            .any(|hit| hit.snippet.contains("release checklist")));
    }
}
