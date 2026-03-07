use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRegistryResponse {
    pub count: usize,
    pub names: Vec<String>,
}

#[tauri::command]
pub fn provider_registry() -> ProviderRegistryResponse {
    let registry = nuka_integrations::providers::ProviderRegistry::default();

    ProviderRegistryResponse {
        count: registry.len(),
        names: registry.names(),
    }
}
