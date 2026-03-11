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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkflowExplanation {
    pub workflow_id: String,
    pub title: String,
    pub summary: String,
    pub steps: Vec<WorkflowExplanationStep>,
    pub dependencies: WorkflowDependencies,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkflowExplanationStep {
    pub id: String,
    pub title: String,
    pub purpose: String,
    pub executor: String,
    pub input_source: String,
    pub output: String,
    pub completion: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkflowDependencies {
    pub agents: Vec<String>,
    pub tools_and_knowledge: Vec<String>,
    pub required_inputs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkflowRevisionPreview {
    pub workflow_id: String,
    pub prompt: String,
    pub change_summary: String,
    pub step_changes: Vec<String>,
    pub dependency_changes: Vec<String>,
    pub outcome_changes: Vec<String>,
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
