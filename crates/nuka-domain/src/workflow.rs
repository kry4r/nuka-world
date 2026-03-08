#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkflowVisibility {
    Private,
    Shared,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkflowInputKind {
    Text,
    LongText,
    Json,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkflowInputDefinition {
    pub id: String,
    pub label: String,
    pub kind: WorkflowInputKind,
    pub required: bool,
    pub placeholder: Option<String>,
}

#[derive(Debug, Clone)]
pub struct WorkflowTemplate {
    pub id: String,
    pub name: String,
    pub saved: bool,
    pub visibility: WorkflowVisibility,
    pub description: String,
    pub inputs: Vec<WorkflowInputDefinition>,
}

impl WorkflowTemplate {
    pub fn saved(name: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.into(),
            saved: true,
            visibility: WorkflowVisibility::Private,
            description: String::new(),
            inputs: Vec::new(),
        }
    }
}
