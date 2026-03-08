pub const LOCAL_FOLDER_SUPPORTED_EXTENSIONS: &[&str] = &[
    "pdf", "md", "markdown", "txt", "json", "yaml", "yml", "rs", "ts", "tsx", "py",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KnowledgeConnectorKind {
    LocalFolder { path: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnowledgeConnector {
    pub id: String,
    pub kind: KnowledgeConnectorKind,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnowledgeCollection {
    pub id: String,
    pub name: String,
    pub description: String,
    pub engine: String,
    pub connectors: Vec<KnowledgeConnector>,
    pub supported_extensions: Vec<String>,
}

impl KnowledgeCollection {
    pub fn local_folder(name: impl Into<String>, path: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.into(),
            description: String::new(),
            engine: "page-index".to_string(),
            connectors: vec![KnowledgeConnector {
                id: uuid::Uuid::new_v4().to_string(),
                kind: KnowledgeConnectorKind::LocalFolder { path: path.into() },
                enabled: true,
            }],
            supported_extensions: LOCAL_FOLDER_SUPPORTED_EXTENSIONS
                .iter()
                .map(|extension| extension.to_string())
                .collect(),
        }
    }
}
