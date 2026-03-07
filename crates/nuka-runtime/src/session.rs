#[derive(Debug, Clone)]
pub struct WorldSession {
    pub id: String,
}

impl WorldSession {
    pub fn new(id: impl Into<String>) -> Self {
        Self { id: id.into() }
    }
}
