#[cfg(test)]
use std::collections::HashMap;

use keyring_core::Entry;

#[async_trait::async_trait]
pub trait ProviderSecretStore: Send + Sync {
    async fn write(&self, provider_id: &str, secret: &str) -> anyhow::Result<()>;
    async fn read(&self, provider_id: &str) -> anyhow::Result<Option<String>>;
    async fn delete(&self, provider_id: &str) -> anyhow::Result<()>;

    fn secret_ref(&self, provider_id: &str) -> String {
        format!("provider:{provider_id}")
    }
}

const PROVIDER_SECRET_SERVICE: &str = "nuka-world.desktop.providers";

#[cfg(test)]
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecretStoreBackendKind {
    WindowsNative,
    PlatformDefault,
}

pub struct DesktopCredentialSecretStore {
    #[cfg(test)]
    backend_kind: SecretStoreBackendKind,
}

impl DesktopCredentialSecretStore {
    pub fn new() -> anyhow::Result<Self> {
        #[cfg(target_os = "windows")]
        {
            keyring::use_native_store(false)
                .map_err(|error| anyhow::anyhow!(error.to_string()))?;

            return Ok(Self {
                #[cfg(test)]
                backend_kind: SecretStoreBackendKind::WindowsNative,
            });
        }

        #[cfg(not(target_os = "windows"))]
        {
            keyring::use_native_store(false)
                .map_err(|error| anyhow::anyhow!(error.to_string()))?;

            Ok(Self {
                #[cfg(test)]
                backend_kind: SecretStoreBackendKind::PlatformDefault,
            })
        }
    }

    fn entry(&self, provider_id: &str) -> anyhow::Result<Entry> {
        Entry::new(PROVIDER_SECRET_SERVICE, &self.secret_ref(provider_id))
            .map_err(|error| anyhow::anyhow!(error.to_string()))
    }

    #[cfg(test)]
    fn backend_kind(&self) -> SecretStoreBackendKind {
        self.backend_kind
    }
}

#[async_trait::async_trait]
impl ProviderSecretStore for DesktopCredentialSecretStore {
    async fn write(&self, provider_id: &str, secret: &str) -> anyhow::Result<()> {
        self.entry(provider_id)?
            .set_password(secret)
            .map_err(|error| anyhow::anyhow!(error.to_string()))
    }

    async fn read(&self, provider_id: &str) -> anyhow::Result<Option<String>> {
        match self.entry(provider_id)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring_core::Error::NoEntry) => Ok(None),
            Err(error) => Err(anyhow::anyhow!(error.to_string())),
        }
    }

    async fn delete(&self, provider_id: &str) -> anyhow::Result<()> {
        match self.entry(provider_id)?.delete_credential() {
            Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
            Err(error) => Err(anyhow::anyhow!(error.to_string())),
        }
    }
}

#[cfg(test)]
#[derive(Default)]
pub struct InMemoryProviderSecretStore {
    secrets: tokio::sync::Mutex<HashMap<String, String>>,
}

#[cfg(test)]
#[async_trait::async_trait]
impl ProviderSecretStore for InMemoryProviderSecretStore {
    async fn write(&self, provider_id: &str, secret: &str) -> anyhow::Result<()> {
        self.secrets
            .lock()
            .await
            .insert(provider_id.to_string(), secret.to_string());
        Ok(())
    }

    async fn read(&self, provider_id: &str) -> anyhow::Result<Option<String>> {
        Ok(self.secrets.lock().await.get(provider_id).cloned())
    }

    async fn delete(&self, provider_id: &str) -> anyhow::Result<()> {
        self.secrets.lock().await.remove(provider_id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::ProviderSecretStore;

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn desktop_secret_store_uses_platform_default_backend_off_windows() {
        let store = super::DesktopCredentialSecretStore::new().unwrap();
        assert_eq!(
            store.backend_kind(),
            super::SecretStoreBackendKind::PlatformDefault
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn desktop_secret_store_uses_windows_native_backend_on_windows() {
        let store = super::DesktopCredentialSecretStore::new().unwrap();
        assert_eq!(
            store.backend_kind(),
            super::SecretStoreBackendKind::WindowsNative
        );
    }

    #[test]
    fn desktop_secret_store_configures_a_default_keyring_store() {
        keyring::release_store();

        let _store = super::DesktopCredentialSecretStore::new().unwrap();

        assert_ne!(keyring::store_info(), "None");

        keyring::release_store();
    }

    #[tokio::test]
    async fn in_memory_secret_store_round_trips_provider_secret() {
        let store = super::InMemoryProviderSecretStore::default();
        store.write("provider-live", "sk-live").await.unwrap();

        assert_eq!(
            store.read("provider-live").await.unwrap().as_deref(),
            Some("sk-live")
        );

        store.delete("provider-live").await.unwrap();
        assert_eq!(store.read("provider-live").await.unwrap(), None);
        assert_eq!(store.secret_ref("provider-live"), "provider:provider-live");
    }
}
