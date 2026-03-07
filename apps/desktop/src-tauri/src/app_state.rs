use crate::settings::SettingsState;
use std::sync::RwLock;

pub struct AppState {
    settings: RwLock<SettingsState>,
    world_runtime: nuka_runtime::world::WorldRuntime,
}

impl AppState {
    pub fn settings(&self) -> SettingsState {
        self.settings.read().expect("settings lock poisoned").clone()
    }

    pub fn world_runtime(&self) -> &nuka_runtime::world::WorldRuntime {
        &self.world_runtime
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            settings: RwLock::new(SettingsState::default()),
            world_runtime: nuka_runtime::world::WorldRuntime::default(),
        }
    }
}
