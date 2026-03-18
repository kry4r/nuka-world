pub const LOCAL_FOLDER_SUPPORTED_EXTENSIONS: &[&str] = &[
    "pdf", "md", "markdown", "txt", "json", "yaml", "yml", "rs", "ts", "tsx", "py",
];

pub const PAGEINDEX_ENGINE_ID: &str = "pageindex";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KnowledgeConnectorKind {
    LocalFolder { path: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnowledgeEngineSummary {
    pub id: String,
    pub label: String,
    pub health: String,
    pub capabilities: Vec<String>,
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
    pub fn user_default() -> Self {
        Self {
            id: "knowledge-base".to_string(),
            name: "User Knowledge Base".to_string(),
            description:
                "Default knowledge library for local sources and future retrieval adapters."
                    .to_string(),
            engine: PAGEINDEX_ENGINE_ID.to_string(),
            connectors: Vec::new(),
            supported_extensions: LOCAL_FOLDER_SUPPORTED_EXTENSIONS
                .iter()
                .map(|extension| extension.to_string())
                .collect(),
        }
    }

    pub fn add_local_folder_connector(&mut self, path: impl Into<String>) -> &KnowledgeConnector {
        let normalized_path = normalize_local_folder_path(&path.into());
        let normalized_key = normalized_local_folder_key(&normalized_path);

        if let Some(existing_index) = self.connectors.iter().position(|connector| {
            matches!(
                &connector.kind,
                KnowledgeConnectorKind::LocalFolder { path }
                    if normalized_local_folder_key(path) == normalized_key
            )
        }) {
            return &self.connectors[existing_index];
        }

        self.connectors.push(KnowledgeConnector {
            id: uuid::Uuid::new_v4().to_string(),
            kind: KnowledgeConnectorKind::LocalFolder {
                path: normalized_path,
            },
            enabled: true,
        });

        self.connectors
            .last()
            .expect("connector list should contain inserted local folder connector")
    }
}

impl KnowledgeEngineSummary {
    pub fn for_engine(engine_id: impl Into<String>, health: impl Into<String>) -> Self {
        let id = normalize_engine_id(&engine_id.into());

        Self {
            label: engine_label(&id),
            capabilities: engine_capabilities(&id),
            id,
            health: health.into(),
        }
    }
}

pub fn normalize_engine_id(engine_id: &str) -> String {
    match engine_id {
        "page-index" => PAGEINDEX_ENGINE_ID.to_string(),
        other => other.to_string(),
    }
}

pub fn engine_label(engine_id: &str) -> String {
    match normalize_engine_id(engine_id).as_str() {
        PAGEINDEX_ENGINE_ID => "PageIndex".to_string(),
        "rag-adapter" => "RAG Adapter".to_string(),
        other => humanize_engine_id(other),
    }
}

pub fn engine_capabilities(engine_id: &str) -> Vec<String> {
    match normalize_engine_id(engine_id).as_str() {
        PAGEINDEX_ENGINE_ID => vec![
            "local-folder-connectors".to_string(),
            "indexing".to_string(),
            "retrieval".to_string(),
        ],
        "rag-adapter" => vec!["connectors".to_string(), "retrieval".to_string()],
        _ => vec!["retrieval".to_string()],
    }
}

fn humanize_engine_id(engine_id: &str) -> String {
    engine_id
        .split(['-', '_'])
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            let mut chars = segment.chars();
            match chars.next() {
                Some(first) => {
                    let mut word = first.to_uppercase().collect::<String>();
                    word.push_str(chars.as_str());
                    word
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_local_folder_path(path: &str) -> String {
    let mut normalized = path.trim().replace('\\', "/");

    while normalized.ends_with('/') && !is_drive_root(&normalized) && normalized.len() > 1 {
        normalized.pop();
    }

    normalized
}

fn normalized_local_folder_key(path: &str) -> String {
    normalize_local_folder_path(path).to_ascii_lowercase()
}

fn is_drive_root(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() == 3 && bytes[1] == b':' && bytes[2] == b'/'
}

#[cfg(test)]
mod tests {
    use super::{KnowledgeCollection, KnowledgeConnectorKind};

    #[test]
    fn add_local_folder_connector_normalizes_and_deduplicates_paths() {
        let mut collection = KnowledgeCollection::user_default();

        let connector = collection.add_local_folder_connector("C:\\Docs\\Rust\\");
        let KnowledgeConnectorKind::LocalFolder { path } = &connector.kind;
        assert_eq!(path, "C:/Docs/Rust");

        collection.add_local_folder_connector("c:/docs/rust");

        assert_eq!(collection.connectors.len(), 1);
    }
}
