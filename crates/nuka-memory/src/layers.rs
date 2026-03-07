#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MemoryLayer {
    Session,
    WorkflowShared,
    KnowledgeBase,
}
