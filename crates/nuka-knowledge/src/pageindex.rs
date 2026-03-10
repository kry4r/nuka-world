use std::path::{Path, PathBuf};

use crate::engine::{
    EngineCapabilities, EngineHealth, IndexedSearchHit, KnowledgeEngine, KnowledgeIndexSummary,
};
use crate::normalizer::{DocumentNormalizer, NormalizedDocument};
use crate::process_manager::{FilesystemProcessManager, ProcessManager, StubProcessManager};
use nuka_domain::knowledge::{KnowledgeCollection, KnowledgeConnectorKind};

pub struct PageIndexEngine<P = FilesystemProcessManager> {
    runtime: String,
    process_manager: P,
}

impl Default for PageIndexEngine<FilesystemProcessManager> {
    fn default() -> Self {
        Self {
            runtime: "pageindex".to_string(),
            process_manager: FilesystemProcessManager,
        }
    }
}

impl PageIndexEngine<StubProcessManager> {
    pub fn new_for_test_missing_runtime() -> Self {
        Self {
            runtime: "pageindex".to_string(),
            process_manager: StubProcessManager::missing_runtime("pageindex runtime missing"),
        }
    }
}

impl<P> PageIndexEngine<P>
where
    P: ProcessManager,
{
    pub fn new(runtime: impl Into<String>, process_manager: P) -> Self {
        Self {
            runtime: runtime.into(),
            process_manager,
        }
    }

    async fn ensure_runtime_ready(&self) -> anyhow::Result<()> {
        self.process_manager.ensure_runtime(&self.runtime).await
    }
}

#[async_trait::async_trait]
impl<P> KnowledgeEngine for PageIndexEngine<P>
where
    P: ProcessManager,
{
    fn id(&self) -> &'static str {
        "pageindex"
    }

    fn capabilities(&self) -> EngineCapabilities {
        EngineCapabilities {
            local_folder_connectors: true,
            indexing: true,
            retrieval: true,
        }
    }

    async fn health(&self) -> EngineHealth {
        match self.process_manager.ensure_runtime(&self.runtime).await {
            Ok(()) => EngineHealth::Ready {
                runtime: self.runtime.clone(),
            },
            Err(error) => EngineHealth::Unavailable {
                reason: error.to_string(),
            },
        }
    }

    async fn rebuild(
        &self,
        collection: &KnowledgeCollection,
    ) -> anyhow::Result<KnowledgeIndexSummary> {
        self.ensure_runtime_ready().await?;

        let documents = normalized_documents(collection);
        let connector_count = collection
            .connectors
            .iter()
            .filter(|connector| connector.enabled)
            .count();
        let indexed_documents = documents.len();

        Ok(KnowledgeIndexSummary {
            indexed_documents,
            indexed_connectors: connector_count,
            detail: format!(
                "Indexed {indexed_documents} document{} from {connector_count} connector{}",
                if indexed_documents == 1 { "" } else { "s" },
                if connector_count == 1 { "" } else { "s" },
            ),
        })
    }

    async fn search(
        &self,
        collections: &[KnowledgeCollection],
        query: &str,
    ) -> anyhow::Result<Vec<IndexedSearchHit>> {
        self.ensure_runtime_ready().await?;

        let needle = query.trim().to_ascii_lowercase();
        if needle.is_empty() {
            return Ok(Vec::new());
        }

        let mut hits = Vec::new();

        for collection in collections {
            for document in normalized_documents(collection) {
                if let Some(snippet) = matching_snippet(&document.content, &needle) {
                    hits.push(IndexedSearchHit {
                        collection_id: collection.id.clone(),
                        path: document.source_path,
                        snippet,
                    });
                }
            }
        }

        Ok(hits)
    }
}

fn normalized_documents(collection: &KnowledgeCollection) -> Vec<NormalizedDocument> {
    let mut documents = Vec::new();

    for connector in &collection.connectors {
        if !connector.enabled {
            continue;
        }

        let KnowledgeConnectorKind::LocalFolder { path } = &connector.kind;
        walk_directory(
            &PathBuf::from(path),
            &collection.supported_extensions,
            &mut documents,
        );
    }

    documents
}

fn walk_directory(
    path: &Path,
    supported_extensions: &[String],
    documents: &mut Vec<NormalizedDocument>,
) {
    let Ok(metadata) = std::fs::metadata(path) else {
        return;
    };

    if metadata.is_file() {
        push_document(path, supported_extensions, documents);
        return;
    }

    let Ok(entries) = std::fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        let child = entry.path();
        if child.is_dir() {
            walk_directory(&child, supported_extensions, documents);
            continue;
        }

        push_document(&child, supported_extensions, documents);
    }
}

fn push_document(
    path: &Path,
    supported_extensions: &[String],
    documents: &mut Vec<NormalizedDocument>,
) {
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return;
    };

    if !supported_extensions
        .iter()
        .any(|supported| supported.eq_ignore_ascii_case(extension))
        || !DocumentNormalizer::supports_extension(extension)
    {
        return;
    }

    let Ok(bytes) = std::fs::read(path) else {
        return;
    };

    let normalized_path = path.to_string_lossy().replace('\\', "/");
    let Ok(document) = DocumentNormalizer::normalize(&normalized_path, &bytes) else {
        return;
    };

    documents.push(document);
}

fn matching_snippet(content: &str, needle: &str) -> Option<String> {
    let lowercase = content.to_ascii_lowercase();
    let match_index = lowercase.find(needle)?;
    let mut start = match_index.saturating_sub(48);
    let mut end = (match_index + needle.len() + 48).min(content.len());

    while start > 0 && !content.is_char_boundary(start) {
        start -= 1;
    }
    while end < content.len() && !content.is_char_boundary(end) {
        end += 1;
    }

    Some(content[start..end].replace('\n', " ").trim().to_string())
}
