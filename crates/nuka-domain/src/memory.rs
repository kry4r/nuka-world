#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MemoryNodeKind {
    Workflow,
    Session,
    Agent,
    Message,
    Fact,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryScope {
    pub id: String,
    pub name: String,
    pub workflow_id: Option<String>,
    pub session_id: Option<String>,
    pub agent_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryNodeSummary {
    pub id: String,
    pub kind: MemoryNodeKind,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryNodeDetail {
    pub id: String,
    pub kind: MemoryNodeKind,
    pub title: String,
    pub body: Option<String>,
    pub related_ids: Vec<String>,
}
