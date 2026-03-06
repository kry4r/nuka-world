#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkflowVisibility {
    Private,
    Shared,
}

#[derive(Debug, Clone)]
pub struct WorkflowTemplate {
    pub id: String,
    pub name: String,
    pub saved: bool,
    pub visibility: WorkflowVisibility,
}

impl WorkflowTemplate {
    pub fn saved(name: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.into(),
            saved: true,
            visibility: WorkflowVisibility::Private,
        }
    }
}
