#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct MemoryGraph {
    pub nodes: Vec<MemoryGraphNode>,
    pub edges: Vec<MemoryGraphEdge>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum MemoryTraceType {
    Working,
    Episodic,
    #[default]
    Semantic,
}

impl MemoryTraceType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Working => "working",
            Self::Episodic => "episodic",
            Self::Semantic => "semantic",
        }
    }

    pub fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "working" => Ok(Self::Working),
            "episodic" => Ok(Self::Episodic),
            "semantic" => Ok(Self::Semantic),
            _ => Err(format!("unknown memory trace type: {value}")),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum MemoryConsolidationState {
    #[default]
    None,
    Candidate,
    Approved,
    Rejected,
    Archived,
}

impl MemoryConsolidationState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Candidate => "candidate",
            Self::Approved => "approved",
            Self::Rejected => "rejected",
            Self::Archived => "archived",
        }
    }

    pub fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "none" => Ok(Self::None),
            "candidate" => Ok(Self::Candidate),
            "approved" => Ok(Self::Approved),
            "rejected" => Ok(Self::Rejected),
            "archived" => Ok(Self::Archived),
            _ => Err(format!("unknown memory consolidation state: {value}")),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MemorySurface {
    Chat,
    Workflow,
}

impl MemorySurface {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Chat => "chat",
            Self::Workflow => "workflow",
        }
    }

    pub fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "chat" => Ok(Self::Chat),
            "workflow" => Ok(Self::Workflow),
            _ => Err(format!("unknown memory surface: {value}")),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReviewDecision {
    PromoteSemantic,
    KeepEpisodic,
    Reject,
}

impl ReviewDecision {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::PromoteSemantic => "promote_semantic",
            Self::KeepEpisodic => "keep_episodic",
            Self::Reject => "reject",
        }
    }

    pub fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "promote_semantic" => Ok(Self::PromoteSemantic),
            "keep_episodic" => Ok(Self::KeepEpisodic),
            "reject" => Ok(Self::Reject),
            _ => Err(format!("unknown review decision: {value}")),
        }
    }
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
    pub trace_type: MemoryTraceType,
    pub consolidation_state: MemoryConsolidationState,
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
    pub trace_type: MemoryTraceType,
    pub consolidation_state: MemoryConsolidationState,
    pub related_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MemoryCandidate {
    pub id: String,
    pub node_id: String,
    pub title: String,
    pub surface: MemorySurface,
    pub owner_id: String,
    pub suggested_schema_id: Option<String>,
    pub confidence: f32,
    pub reason: String,
    pub evidence_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryCandidateEvidence {
    pub id: String,
    pub candidate_id: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemorySnapshot {
    pub id: String,
    pub node_id: String,
    pub title: String,
    pub body: Option<String>,
    pub trace_type: MemoryTraceType,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryReviewAction {
    pub id: String,
    pub candidate_id: String,
    pub node_id: String,
    pub decision: ReviewDecision,
}

#[cfg(test)]
mod tests {
    #[test]
    fn memory_node_kind_rejects_unknown_values() {
        let error = super::MemoryNodeKind::from_str("timeline").unwrap_err();

        assert_eq!(error.to_string(), "unknown memory node kind: timeline");
    }

    #[test]
    fn memory_trace_type_rejects_unknown_values() {
        let error = super::MemoryTraceType::from_str("flashbulb").unwrap_err();

        assert_eq!(error.to_string(), "unknown memory trace type: flashbulb");
    }
}
