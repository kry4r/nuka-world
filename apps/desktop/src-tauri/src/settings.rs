#[derive(Debug, Clone)]
pub struct SettingsState {
    pub minimize_to_tray: bool,
}

impl Default for SettingsState {
    fn default() -> Self {
        Self {
            minimize_to_tray: true,
        }
    }
}
