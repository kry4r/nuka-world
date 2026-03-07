#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnowledgeLibrary {
    pub id: String,
    pub name: String,
}

impl KnowledgeLibrary {
    pub fn user_default() -> Self {
        Self {
            id: "knowledge-base".to_string(),
            name: "User Knowledge Base".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn knowledge_library_keeps_name() {
        let library = crate::library::KnowledgeLibrary {
            id: "kb-1".to_string(),
            name: "Team Notes".to_string(),
        };

        assert_eq!(library.name, "Team Notes");
    }
}
