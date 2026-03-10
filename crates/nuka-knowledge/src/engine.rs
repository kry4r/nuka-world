use nuka_domain::knowledge::KnowledgeCollection;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineCapabilities {
    pub local_folder_connectors: bool,
    pub indexing: bool,
    pub retrieval: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EngineHealth {
    Ready { runtime: String },
    Unavailable { reason: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnowledgeIndexSummary {
    pub indexed_documents: usize,
    pub indexed_connectors: usize,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedSearchHit {
    pub collection_id: String,
    pub path: String,
    pub snippet: String,
}

#[async_trait::async_trait]
pub trait KnowledgeEngine: Send + Sync {
    fn id(&self) -> &'static str;
    fn capabilities(&self) -> EngineCapabilities;
    async fn health(&self) -> EngineHealth;
    async fn rebuild(
        &self,
        collection: &KnowledgeCollection,
    ) -> anyhow::Result<KnowledgeIndexSummary>;
    async fn search(
        &self,
        collections: &[KnowledgeCollection],
        query: &str,
    ) -> anyhow::Result<Vec<IndexedSearchHit>>;
}
