use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeLibraryResponse {
    pub id: String,
    pub name: String,
}

#[tauri::command]
pub fn default_knowledge_library() -> KnowledgeLibraryResponse {
    let library = nuka_knowledge::library::KnowledgeLibrary::user_default();

    KnowledgeLibraryResponse {
        id: library.id,
        name: library.name,
    }
}
