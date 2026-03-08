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

#[async_trait::async_trait]
pub trait KnowledgeEngine: Send + Sync {
    fn id(&self) -> &'static str;
    fn capabilities(&self) -> EngineCapabilities;
    async fn health(&self) -> EngineHealth;
}
