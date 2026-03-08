use crate::settings::SettingsState;
use std::sync::RwLock;

#[allow(dead_code)]
pub struct AppState {
    settings: RwLock<SettingsState>,
    provider_service: nuka_runtime::providers::ProvidersService,
    settings_service: nuka_runtime::settings_service::SettingsService,
    agents_service: nuka_runtime::agents::AgentsService,
    knowledge_service: nuka_runtime::knowledge_service::KnowledgeService,
    memory_service: nuka_runtime::memory_service::MemoryService,
    world_runtime: nuka_runtime::world::WorldRuntime,
    workflow_world_runtime: nuka_runtime::workflow_world::WorkflowWorldRuntime,
}

#[allow(dead_code)]
impl AppState {
    pub fn new(
        settings: SettingsState,
        provider_service: nuka_runtime::providers::ProvidersService,
        settings_service: nuka_runtime::settings_service::SettingsService,
        agents_service: nuka_runtime::agents::AgentsService,
        knowledge_service: nuka_runtime::knowledge_service::KnowledgeService,
        memory_service: nuka_runtime::memory_service::MemoryService,
        world_runtime: nuka_runtime::world::WorldRuntime,
        workflow_world_runtime: nuka_runtime::workflow_world::WorkflowWorldRuntime,
    ) -> Self {
        Self {
            settings: RwLock::new(settings),
            provider_service,
            settings_service,
            agents_service,
            knowledge_service,
            memory_service,
            world_runtime,
            workflow_world_runtime,
        }
    }

    pub fn settings(&self) -> SettingsState {
        self.settings.read().expect("settings lock poisoned").clone()
    }

    pub fn set_settings(&self, settings: SettingsState) {
        *self.settings.write().expect("settings lock poisoned") = settings;
    }

    pub fn provider_service(&self) -> &nuka_runtime::providers::ProvidersService {
        &self.provider_service
    }

    pub fn settings_service(&self) -> &nuka_runtime::settings_service::SettingsService {
        &self.settings_service
    }

    pub fn agents_service(&self) -> &nuka_runtime::agents::AgentsService {
        &self.agents_service
    }

    pub fn knowledge_service(&self) -> &nuka_runtime::knowledge_service::KnowledgeService {
        &self.knowledge_service
    }

    pub fn memory_service(&self) -> &nuka_runtime::memory_service::MemoryService {
        &self.memory_service
    }

    pub fn world_runtime(&self) -> &nuka_runtime::world::WorldRuntime {
        &self.world_runtime
    }

    pub fn workflow_world_runtime(&self) -> &nuka_runtime::workflow_world::WorkflowWorldRuntime {
        &self.workflow_world_runtime
    }
}
