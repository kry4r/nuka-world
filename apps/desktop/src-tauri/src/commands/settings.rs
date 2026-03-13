use crate::{app_state::AppState, settings::SettingsState};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

const APPEARANCE_STATE_KEY: &str = "settings.appearance";
const PROVIDERS_STATE_KEY: &str = "settings.providers";
const RUNTIME_STATE_KEY: &str = "settings.runtime";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPayload {
    pub default_provider_id: String,
    pub fallback_provider_id: String,
    pub connection_checks: bool,
    pub external_editor_path: String,
    pub interface_font: String,
    pub message_font: String,
    pub text_size: String,
    pub language: String,
    pub response_locale: String,
    pub time_format: String,
    pub density: String,
    pub motion: String,
    pub window_chrome: String,
    pub sidebar_default: String,
    pub close_behavior: String,
    pub launch_at_login: bool,
    pub tray_resident: bool,
    pub background_adapters: bool,
    pub logging: String,
    pub notifications: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppearanceSettingsState {
    interface_font: String,
    message_font: String,
    text_size: String,
    language: String,
    response_locale: String,
    time_format: String,
    density: String,
    motion: String,
    window_chrome: String,
    sidebar_default: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderSettingsState {
    fallback_provider_id: String,
    connection_checks: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSettingsState {
    external_editor_path: String,
    close_behavior: String,
    launch_at_login: bool,
    tray_resident: bool,
    background_adapters: bool,
    logging: String,
    notifications: bool,
}

#[tauri::command]
pub async fn load_settings(
    state: tauri::State<'_, AppState>,
) -> Result<SettingsPayload, String> {
    load_settings_inner(&state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn save_settings(
    payload: SettingsPayload,
    state: tauri::State<'_, AppState>,
) -> Result<SettingsPayload, String> {
    save_settings_inner(&state, payload)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn open_external_prompt_draft(
    initial_content: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    open_external_prompt_draft_inner(initial_content, &state)
        .await
        .map_err(|error| error.to_string())
}

async fn load_settings_inner(state: &AppState) -> anyhow::Result<SettingsPayload> {
    let settings = state.settings_service().load().await?;
    let appearance = load_state::<AppearanceSettingsState>(state, APPEARANCE_STATE_KEY)
        .await?
        .unwrap_or_default();
    let provider_preferences = load_state::<ProviderSettingsState>(state, PROVIDERS_STATE_KEY)
        .await?
        .unwrap_or_default();
    let runtime = load_state::<RuntimeSettingsState>(state, RUNTIME_STATE_KEY)
        .await?
        .unwrap_or_else(|| RuntimeSettingsState::from_close_policy(settings.close_to_tray));

    Ok(SettingsPayload {
        default_provider_id: settings.default_provider_id.unwrap_or_default(),
        fallback_provider_id: provider_preferences.fallback_provider_id,
        connection_checks: provider_preferences.connection_checks,
        external_editor_path: runtime.external_editor_path,
        interface_font: appearance.interface_font,
        message_font: appearance.message_font,
        text_size: appearance.text_size,
        language: appearance.language,
        response_locale: appearance.response_locale,
        time_format: appearance.time_format,
        density: appearance.density,
        motion: appearance.motion,
        window_chrome: appearance.window_chrome,
        sidebar_default: appearance.sidebar_default,
        close_behavior: runtime.close_behavior,
        launch_at_login: runtime.launch_at_login,
        tray_resident: runtime.tray_resident,
        background_adapters: runtime.background_adapters,
        logging: runtime.logging,
        notifications: runtime.notifications,
    })
}

async fn save_settings_inner(
    state: &AppState,
    payload: SettingsPayload,
) -> anyhow::Result<SettingsPayload> {
    let mut settings = state.settings_service().load().await?;
    settings.default_provider_id = option_string(&payload.default_provider_id);
    settings.close_to_tray = payload.close_behavior != "Quit app";

    state.settings_service().save(&settings).await?;
    state
        .settings_service()
        .save_state_value(
            APPEARANCE_STATE_KEY,
            &serde_json::to_string(&AppearanceSettingsState::from(&payload))?,
        )
        .await?;
    state
        .settings_service()
        .save_state_value(
            PROVIDERS_STATE_KEY,
            &serde_json::to_string(&ProviderSettingsState::from(&payload))?,
        )
        .await?;
    state
        .settings_service()
        .save_state_value(
            RUNTIME_STATE_KEY,
            &serde_json::to_string(&RuntimeSettingsState::from(&payload))?,
        )
        .await?;
    state.set_settings(SettingsState::from(&settings));

    Ok(payload)
}

async fn load_state<T>(state: &AppState, key: &str) -> anyhow::Result<Option<T>>
where
    T: DeserializeOwned,
{
    state
        .settings_service()
        .load_state_value(key)
        .await?
        .map(|value| serde_json::from_str(&value))
        .transpose()
        .map_err(Into::into)
}

async fn open_external_prompt_draft_inner(
    initial_content: String,
    state: &AppState,
) -> anyhow::Result<String> {
    let settings = load_settings_inner(state).await?;
    let editor_path = settings.external_editor_path.trim().to_string();
    if editor_path.is_empty() {
        anyhow::bail!("external editor path is not configured");
    }

    let draft_path = create_external_draft_path("nuka-prompt-draft");
    std::fs::write(&draft_path, initial_content.as_bytes())?;
    let read_path = draft_path.clone();

    let read_result = tokio::task::spawn_blocking(move || -> anyhow::Result<String> {
        let status = std::process::Command::new(&editor_path)
            .arg(&read_path)
            .status()?;
        if !status.success() {
            anyhow::bail!("external editor exited with status {status}");
        }

        Ok(std::fs::read_to_string(&read_path)?)
    })
    .await??;

    let _ = std::fs::remove_file(&draft_path);
    Ok(read_result)
}

fn create_external_draft_path(prefix: &str) -> std::path::PathBuf {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    std::env::temp_dir().join(format!("{prefix}-{millis}-{}.txt", std::process::id()))
}

fn option_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

impl Default for AppearanceSettingsState {
    fn default() -> Self {
        Self {
            interface_font: "Inter".to_string(),
            message_font: "Inter Text".to_string(),
            text_size: "14 px".to_string(),
            language: "English (US)".to_string(),
            response_locale: "Follow session".to_string(),
            time_format: "24-hour".to_string(),
            density: "Comfortable".to_string(),
            motion: "Standard".to_string(),
            window_chrome: "Minimal glass".to_string(),
            sidebar_default: "Expanded".to_string(),
        }
    }
}

impl Default for ProviderSettingsState {
    fn default() -> Self {
        Self {
            fallback_provider_id: String::new(),
            connection_checks: true,
        }
    }
}

impl Default for RuntimeSettingsState {
    fn default() -> Self {
        Self::from_close_policy(true)
    }
}

impl RuntimeSettingsState {
    fn from_close_policy(minimize_to_tray: bool) -> Self {
        Self {
            external_editor_path: String::new(),
            close_behavior: if minimize_to_tray {
                "Minimize to tray".to_string()
            } else {
                "Quit app".to_string()
            },
            launch_at_login: false,
            tray_resident: true,
            background_adapters: true,
            logging: "Standard".to_string(),
            notifications: true,
        }
    }
}

impl From<&SettingsPayload> for AppearanceSettingsState {
    fn from(value: &SettingsPayload) -> Self {
        Self {
            interface_font: value.interface_font.clone(),
            message_font: value.message_font.clone(),
            text_size: value.text_size.clone(),
            language: value.language.clone(),
            response_locale: value.response_locale.clone(),
            time_format: value.time_format.clone(),
            density: value.density.clone(),
            motion: value.motion.clone(),
            window_chrome: value.window_chrome.clone(),
            sidebar_default: value.sidebar_default.clone(),
        }
    }
}

impl From<&SettingsPayload> for ProviderSettingsState {
    fn from(value: &SettingsPayload) -> Self {
        Self {
            fallback_provider_id: value.fallback_provider_id.clone(),
            connection_checks: value.connection_checks,
        }
    }
}

impl From<&SettingsPayload> for RuntimeSettingsState {
    fn from(value: &SettingsPayload) -> Self {
        Self {
            external_editor_path: value.external_editor_path.clone(),
            close_behavior: value.close_behavior.clone(),
            launch_at_login: value.launch_at_login,
            tray_resident: value.tray_resident,
            background_adapters: value.background_adapters,
            logging: value.logging.clone(),
            notifications: value.notifications,
        }
    }
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn settings_round_trip_updates_runtime_state_and_close_policy() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let payload: super::SettingsPayload = serde_json::from_value(serde_json::json!({
            "defaultProviderId": "provider-local",
            "fallbackProviderId": "provider-fallback",
            "connectionChecks": false,
            "externalEditorPath": "C:\\Tools\\notepad++.exe",
            "interfaceFont": "IBM Plex Sans",
            "messageFont": "System UI",
            "textSize": "16 px",
            "language": "English (US)",
            "responseLocale": "Follow session",
            "timeFormat": "12-hour",
            "density": "Compact",
            "motion": "Reduced",
            "windowChrome": "Native frame",
            "sidebarDefault": "Collapsed",
            "closeBehavior": "Quit app",
            "launchAtLogin": true,
            "trayResident": false,
            "backgroundAdapters": false,
            "logging": "Verbose",
            "notifications": false
        }))
        .unwrap();

        let saved = super::save_settings_inner(&state, payload).await.unwrap();

        let loaded = super::load_settings_inner(&state).await.unwrap();
        let saved_value = serde_json::to_value(&saved).unwrap();
        let loaded_value = serde_json::to_value(&loaded).unwrap();

        assert_eq!(loaded, saved);
        assert_eq!(
            saved_value.get("externalEditorPath").and_then(serde_json::Value::as_str),
            Some("C:\\Tools\\notepad++.exe")
        );
        assert_eq!(
            loaded_value
                .get("externalEditorPath")
                .and_then(serde_json::Value::as_str),
            Some("C:\\Tools\\notepad++.exe")
        );
        assert!(!state.settings().minimize_to_tray);
    }
}
