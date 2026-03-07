#[derive(Debug, Clone)]
pub struct WorldSession {
    pub id: String,
}

impl WorldSession {
    pub fn new() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
        }
    }
}
