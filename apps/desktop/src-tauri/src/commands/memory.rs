use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryScopeResponse {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub workflow_id: Option<String>,
    pub session_id: Option<String>,
    pub agent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryNodeDetailResponse {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub body: Option<String>,
    pub related_ids: Vec<String>,
    pub workflow_id: Option<String>,
    pub session_id: Option<String>,
    pub agent_id: Option<String>,
}

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

#[tauri::command]
pub async fn list_memory_scopes(
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<Vec<MemoryScopeResponse>, String> {
    list_memory_scopes_inner(&state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn list_memory_by_workflow(
    workflow_id: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<Vec<MemoryScopeResponse>, String> {
    list_memory_by_workflow_inner(workflow_id, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_memory_node_detail(
    node_id: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<Option<MemoryNodeDetailResponse>, String> {
    get_memory_node_detail_inner(node_id, &state)
        .await
        .map_err(|error| error.to_string())
}

async fn list_memory_scopes_inner(
    state: &crate::app_state::AppState,
) -> anyhow::Result<Vec<MemoryScopeResponse>> {
    Ok(state
        .memory_service()
        .list_scopes()
        .await?
        .into_iter()
        .map(MemoryScopeResponse::from)
        .collect())
}

async fn list_memory_by_workflow_inner(
    workflow_id: String,
    state: &crate::app_state::AppState,
) -> anyhow::Result<Vec<MemoryScopeResponse>> {
    Ok(state
        .memory_service()
        .list_by_workflow(&workflow_id)
        .await?
        .into_iter()
        .map(MemoryScopeResponse::from)
        .collect())
}

async fn get_memory_node_detail_inner(
    node_id: String,
    state: &crate::app_state::AppState,
) -> anyhow::Result<Option<MemoryNodeDetailResponse>> {
    Ok(state
        .memory_service()
        .get_scope(&node_id)
        .await?
        .map(MemoryNodeDetailResponse::from))
}

impl From<nuka_domain::memory::MemoryScope> for MemoryScopeResponse {
    fn from(scope: nuka_domain::memory::MemoryScope) -> Self {
        let kind = memory_scope_kind(&scope).to_string();

        Self {
            id: scope.id,
            title: scope.name,
            kind,
            workflow_id: scope.workflow_id,
            session_id: scope.session_id,
            agent_id: scope.agent_id,
        }
    }
}

impl From<nuka_domain::memory::MemoryScope> for MemoryNodeDetailResponse {
    fn from(scope: nuka_domain::memory::MemoryScope) -> Self {
        let kind = memory_scope_kind(&scope).to_string();
        let workflow_id = scope.workflow_id.clone();
        let session_id = scope.session_id.clone();
        let agent_id = scope.agent_id.clone();
        let related_ids = [workflow_id.clone(), session_id.clone(), agent_id.clone()]
            .into_iter()
            .flatten()
            .collect();

        Self {
            id: scope.id,
            title: scope.name,
            kind,
            body: Some("Workflow-linked scope stored in local memory state.".to_string()),
            related_ids,
            workflow_id,
            session_id,
            agent_id,
        }
    }
}

fn memory_scope_kind(scope: &nuka_domain::memory::MemoryScope) -> &'static str {
    if scope.session_id.is_some() {
        "session"
    } else if scope.agent_id.is_some() {
        "agent"
    } else if scope.workflow_id.is_some() {
        "workflow"
    } else {
        "fact"
    }
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn memory_lists_scopes_by_workflow() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        state
            .memory_service()
            .save_scope(nuka_domain::memory::MemoryScope {
                id: "memory-review".to_string(),
                name: "Review Memory".to_string(),
                workflow_id: Some("workflow-review".to_string()),
                session_id: Some("session-review".to_string()),
                agent_id: Some("agent-reviewer".to_string()),
            })
            .await
            .unwrap();

        let scopes = super::list_memory_by_workflow_inner("workflow-review".to_string(), &state)
            .await
            .unwrap();

        assert_eq!(scopes.len(), 1);
        assert_eq!(scopes[0].workflow_id.as_deref(), Some("workflow-review"));
    }

    #[tokio::test]
    async fn memory_detail_shows_real_metadata() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        state
            .memory_service()
            .save_scope(nuka_domain::memory::MemoryScope {
                id: "memory-review".to_string(),
                name: "Review Memory".to_string(),
                workflow_id: Some("workflow-review".to_string()),
                session_id: Some("session-review".to_string()),
                agent_id: Some("agent-reviewer".to_string()),
            })
            .await
            .unwrap();

        let detail = super::get_memory_node_detail_inner("memory-review".to_string(), &state)
            .await
            .unwrap()
            .expect("detail should exist");

        assert_eq!(detail.workflow_id.as_deref(), Some("workflow-review"));
        assert_eq!(detail.session_id.as_deref(), Some("session-review"));
        assert_eq!(detail.agent_id.as_deref(), Some("agent-reviewer"));
    }

    #[tokio::test]
    async fn memory_lists_empty_scopes_honestly_when_no_nodes_exist() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let scopes = super::list_memory_scopes_inner(&state).await.unwrap();
        assert!(scopes.is_empty());
    }
}
