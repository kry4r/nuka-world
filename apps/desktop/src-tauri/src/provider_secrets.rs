use std::{
    collections::HashMap,
    io::Write,
    path::{Path, PathBuf},
};

use aes_gcm_siv::{
    aead::{Aead, KeyInit},
    Aes256GcmSiv,
};
use serde::{Deserialize, Serialize};

#[async_trait::async_trait]
pub trait ProviderSecretStore: Send + Sync {
    async fn write(&self, provider_id: &str, secret: &str) -> anyhow::Result<()>;
    async fn read(&self, provider_id: &str) -> anyhow::Result<Option<String>>;
    async fn delete(&self, provider_id: &str) -> anyhow::Result<()>;

    fn secret_ref(&self, provider_id: &str) -> String {
        format!("provider:{provider_id}")
    }
}

#[cfg(test)]
const PROVIDER_SECRET_ROOT_ENV: &str = "NUKA_PROVIDER_SECRET_ROOT";
const PROVIDER_SECRET_KEY_FILE: &str = "provider-secrets.key";
const PROVIDER_SECRET_VAULT_FILE: &str = "provider-secrets.vault.json";
const PROVIDER_SECRET_VAULT_VERSION: u8 = 1;

pub struct DesktopCredentialSecretStore {
    vault_path: PathBuf,
    key_path: PathBuf,
    lock: tokio::sync::Mutex<()>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EncryptedSecretRecord {
    nonce: Vec<u8>,
    ciphertext: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProviderSecretVault {
    #[serde(default = "provider_secret_vault_version")]
    version: u8,
    #[serde(default)]
    entries: HashMap<String, EncryptedSecretRecord>,
}

impl Default for ProviderSecretVault {
    fn default() -> Self {
        Self {
            version: provider_secret_vault_version(),
            entries: HashMap::new(),
        }
    }
}

impl DesktopCredentialSecretStore {
    #[cfg(test)]
    pub fn new() -> anyhow::Result<Self> {
        let root = std::env::var(PROVIDER_SECRET_ROOT_ENV)
            .map(PathBuf::from)
            .unwrap_or_else(|_| std::env::temp_dir().join("nuka-world-provider-secrets"));
        Self::new_in(root)
    }

    pub fn new_in(root: impl Into<PathBuf>) -> anyhow::Result<Self> {
        let root = root.into();
        std::fs::create_dir_all(&root)?;

        Ok(Self {
            vault_path: root.join(PROVIDER_SECRET_VAULT_FILE),
            key_path: root.join(PROVIDER_SECRET_KEY_FILE),
            lock: tokio::sync::Mutex::new(()),
        })
    }

    fn load_vault(&self) -> anyhow::Result<ProviderSecretVault> {
        if !self.vault_path.exists() {
            return Ok(ProviderSecretVault::default());
        }

        let body = std::fs::read(&self.vault_path)?;
        if body.is_empty() {
            return Ok(ProviderSecretVault::default());
        }

        let vault: ProviderSecretVault = serde_json::from_slice(&body)?;
        if vault.version != PROVIDER_SECRET_VAULT_VERSION {
            anyhow::bail!(
                "unsupported provider secret vault version: {}",
                vault.version
            );
        }

        Ok(vault)
    }

    fn save_vault(&self, vault: &ProviderSecretVault) -> anyhow::Result<()> {
        let body = serde_json::to_vec_pretty(vault)?;
        write_private_file(&self.vault_path, &body)
    }

    fn cipher(&self) -> anyhow::Result<Aes256GcmSiv> {
        let key = self.load_or_create_master_key()?;
        Aes256GcmSiv::new_from_slice(&key).map_err(|error| {
            anyhow::anyhow!("failed to initialize provider secret cipher: {error}")
        })
    }

    fn load_or_create_master_key(&self) -> anyhow::Result<[u8; 32]> {
        if self.key_path.exists() {
            let key = std::fs::read(&self.key_path)?;
            return key
                .try_into()
                .map_err(|_| anyhow::anyhow!("provider secret key file must be 32 bytes"));
        }

        let mut key = [0_u8; 32];
        getrandom::fill(&mut key)?;
        write_private_file(&self.key_path, &key)?;
        Ok(key)
    }

    fn encrypt_secret(&self, secret: &str) -> anyhow::Result<EncryptedSecretRecord> {
        let cipher = self.cipher()?;
        let mut nonce = [0_u8; 12];
        getrandom::fill(&mut nonce)?;
        let nonce = aes_gcm_siv::Nonce::try_from(nonce.as_slice())
            .map_err(|_| anyhow::anyhow!("provider secret nonce must be 12 bytes"))?;
        let ciphertext = cipher
            .encrypt(&nonce, secret.as_bytes())
            .map_err(|error| anyhow::anyhow!("failed to encrypt provider secret: {error}"))?;

        Ok(EncryptedSecretRecord {
            nonce: nonce.as_slice().to_vec(),
            ciphertext,
        })
    }

    fn decrypt_secret(&self, record: &EncryptedSecretRecord) -> anyhow::Result<String> {
        if record.nonce.len() != 12 {
            anyhow::bail!("provider secret nonce must be 12 bytes");
        }

        let cipher = self.cipher()?;
        let nonce = aes_gcm_siv::Nonce::try_from(record.nonce.as_slice())
            .map_err(|_| anyhow::anyhow!("provider secret nonce must be 12 bytes"))?;
        let plaintext = cipher
            .decrypt(&nonce, record.ciphertext.as_slice())
            .map_err(|error| anyhow::anyhow!("failed to decrypt provider secret: {error}"))?;

        String::from_utf8(plaintext).map_err(Into::into)
    }
}

#[async_trait::async_trait]
impl ProviderSecretStore for DesktopCredentialSecretStore {
    async fn write(&self, provider_id: &str, secret: &str) -> anyhow::Result<()> {
        let _guard = self.lock.lock().await;
        let mut vault = self.load_vault()?;
        vault
            .entries
            .insert(provider_id.to_string(), self.encrypt_secret(secret)?);
        self.save_vault(&vault)
    }

    async fn read(&self, provider_id: &str) -> anyhow::Result<Option<String>> {
        let _guard = self.lock.lock().await;
        let vault = self.load_vault()?;
        vault
            .entries
            .get(provider_id)
            .map(|record| self.decrypt_secret(record))
            .transpose()
    }

    async fn delete(&self, provider_id: &str) -> anyhow::Result<()> {
        let _guard = self.lock.lock().await;
        let mut vault = self.load_vault()?;
        if vault.entries.remove(provider_id).is_some() {
            self.save_vault(&vault)?;
        }
        Ok(())
    }
}

fn provider_secret_vault_version() -> u8 {
    PROVIDER_SECRET_VAULT_VERSION
}

fn write_private_file(path: &Path, body: &[u8]) -> anyhow::Result<()> {
    let temp_path = path.with_extension("tmp");
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    let mut file = options.open(&temp_path)?;
    file.write_all(body)?;
    file.sync_all()?;
    drop(file);
    std::fs::rename(&temp_path, path)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    }

    Ok(())
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
    use std::sync::{Mutex, OnceLock};

    const SECRET_ROOT_ENV: &str = "NUKA_PROVIDER_SECRET_ROOT";

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn unique_temp_dir() -> std::path::PathBuf {
        let unique = format!(
            "nuka-world-provider-secrets-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after unix epoch")
                .as_nanos()
        );

        std::env::temp_dir().join(unique)
    }

    #[tokio::test]
    async fn desktop_secret_store_persists_encrypted_provider_vault_in_configured_root() {
        let _guard = env_lock().lock().unwrap();
        let root = unique_temp_dir();
        std::fs::create_dir_all(&root).unwrap();
        std::env::set_var(SECRET_ROOT_ENV, &root);

        let store = super::DesktopCredentialSecretStore::new().unwrap();
        store
            .write("provider-live", "sk-live-secret")
            .await
            .unwrap();

        let vault_path = root.join("provider-secrets.vault.json");
        let key_path = root.join("provider-secrets.key");

        assert!(
            vault_path.exists(),
            "expected encrypted vault file to exist"
        );
        assert!(key_path.exists(), "expected vault key file to exist");
        let vault_body = std::fs::read_to_string(&vault_path).unwrap();
        assert!(
            !vault_body.contains("sk-live-secret"),
            "vault should not persist provider secrets in plaintext"
        );

        let reopened = super::DesktopCredentialSecretStore::new().unwrap();
        assert_eq!(
            reopened.read("provider-live").await.unwrap().as_deref(),
            Some("sk-live-secret")
        );

        std::env::remove_var(SECRET_ROOT_ENV);
        std::fs::remove_dir_all(&root).ok();
    }

    #[tokio::test]
    async fn desktop_secret_store_deletes_secrets_from_encrypted_vault() {
        let _guard = env_lock().lock().unwrap();
        let root = unique_temp_dir();
        std::fs::create_dir_all(&root).unwrap();
        std::env::set_var(SECRET_ROOT_ENV, &root);

        let store = super::DesktopCredentialSecretStore::new().unwrap();
        store
            .write("provider-live", "sk-live-secret")
            .await
            .unwrap();
        store.delete("provider-live").await.unwrap();

        let reopened = super::DesktopCredentialSecretStore::new().unwrap();
        assert_eq!(reopened.read("provider-live").await.unwrap(), None);

        std::env::remove_var(SECRET_ROOT_ENV);
        std::fs::remove_dir_all(&root).ok();
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
