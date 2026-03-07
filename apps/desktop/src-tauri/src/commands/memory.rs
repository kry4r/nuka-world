use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryPromotionResponse {
    pub can_promote: bool,
}

#[tauri::command]
pub fn memory_promotion_policy(saved_workflow: bool) -> MemoryPromotionResponse {
    MemoryPromotionResponse {
        can_promote: nuka_memory::promote::can_promote_to_workflow_shared(saved_workflow),
    }
}
