use crate::settings::SettingsState;
use std::sync::RwLock;

#[derive(Debug)]
pub struct AppState {
    settings: RwLock<SettingsState>,
}

impl AppState {
    pub fn settings(&self) -> SettingsState {
        self.settings.read().expect("settings lock poisoned").clone()
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            settings: RwLock::new(SettingsState::default()),
        }
    }
}
