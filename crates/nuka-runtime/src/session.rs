#[derive(Debug, Clone)]
pub struct WorldSession {
    pub id: String,
    pub mode: crate::world::WorldChatMode,
}

impl WorldSession {
    pub fn new(mode: crate::world::WorldChatMode) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            mode,
        }
    }
}
