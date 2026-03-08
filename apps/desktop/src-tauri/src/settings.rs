#[derive(Debug, Clone)]
pub struct SettingsState {
    pub minimize_to_tray: bool,
}

impl From<&nuka_storage::settings::DesktopSettings> for SettingsState {
    fn from(settings: &nuka_storage::settings::DesktopSettings) -> Self {
        Self {
            minimize_to_tray: settings.close_to_tray,
        }
    }
}

impl Default for SettingsState {
    fn default() -> Self {
        Self {
            minimize_to_tray: true,
        }
    }
}
