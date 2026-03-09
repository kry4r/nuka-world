#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct MemoryGraph {
    pub nodes: Vec<MemoryGraphNode>,
    pub edges: Vec<MemoryGraphEdge>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MemoryNodeKind {
    Workflow,
    Session,
    Agent,
    Message,
    Fact,
}

impl MemoryNodeKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Workflow => "workflow",
            Self::Session => "session",
            Self::Agent => "agent",
            Self::Message => "message",
            Self::Fact => "fact",
        }
    }

    pub fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "workflow" => Ok(Self::Workflow),
            "session" => Ok(Self::Session),
            "agent" => Ok(Self::Agent),
            "message" => Ok(Self::Message),
            "fact" => Ok(Self::Fact),
            _ => Err(format!("unknown memory node kind: {value}")),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryGraphNode {
    pub id: String,
    pub kind: MemoryNodeKind,
    pub title: String,
    pub body: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryGraphEdge {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub relation: String,
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

#[cfg(test)]
mod tests {
    #[test]
    fn memory_node_kind_rejects_unknown_values() {
        let error = super::MemoryNodeKind::from_str("timeline").unwrap_err();

        assert_eq!(error.to_string(), "unknown memory node kind: timeline");
    }
}
