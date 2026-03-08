#[async_trait::async_trait]
pub trait ProcessManager: Send + Sync {
    async fn ensure_runtime(&self, executable: &str) -> anyhow::Result<()>;
}

#[derive(Debug, Clone, Default)]
pub struct FilesystemProcessManager;

#[async_trait::async_trait]
impl ProcessManager for FilesystemProcessManager {
    async fn ensure_runtime(&self, executable: &str) -> anyhow::Result<()> {
        if executable.trim().is_empty() {
            anyhow::bail!("missing runtime executable");
        }

        let path = std::path::Path::new(executable);
        if path.exists() {
            Ok(())
        } else {
            anyhow::bail!("runtime not found: {executable}");
        }
    }
}

#[derive(Debug, Clone)]
pub struct StubProcessManager {
    result: Result<(), String>,
}

impl StubProcessManager {
    pub fn ready() -> Self {
        Self { result: Ok(()) }
    }

    pub fn missing_runtime(reason: impl Into<String>) -> Self {
        Self {
            result: Err(reason.into()),
        }
    }
}

#[async_trait::async_trait]
impl ProcessManager for StubProcessManager {
    async fn ensure_runtime(&self, executable: &str) -> anyhow::Result<()> {
        match &self.result {
            Ok(()) => {
                if executable.trim().is_empty() {
                    anyhow::bail!("missing runtime executable");
                }

                Ok(())
            }
            Err(reason) => anyhow::bail!("{reason}"),
        }
    }
}
