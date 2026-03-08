use crate::engine::{EngineCapabilities, EngineHealth, KnowledgeEngine};
use crate::process_manager::{FilesystemProcessManager, ProcessManager, StubProcessManager};

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
}
