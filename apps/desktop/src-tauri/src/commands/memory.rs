use serde::Serialize;
use std::collections::BTreeSet;

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
    pub trace_type: String,
    pub consolidation_state: String,
    pub related_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryGraphNodeResponse {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub body: Option<String>,
    pub trace_type: String,
    pub consolidation_state: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryGraphEdgeResponse {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub relation: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryGraphResponse {
    pub nodes: Vec<MemoryGraphNodeResponse>,
    pub edges: Vec<MemoryGraphEdgeResponse>,
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

#[tauri::command]
pub async fn load_memory_graph(
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<MemoryGraphResponse, String> {
    load_memory_graph_inner(&state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_memory_node(
    node_id: String,
    title: String,
    body: Option<String>,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<MemoryGraphNodeResponse, String> {
    update_memory_node_inner(node_id, title, body, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_memory_node(
    node_id: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<(), String> {
    delete_memory_node_inner(node_id, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn create_memory_edge(
    edge_id: String,
    source_id: String,
    target_id: String,
    relation: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<MemoryGraphEdgeResponse, String> {
    create_memory_edge_inner(edge_id, source_id, target_id, relation, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_memory_edge(
    edge_id: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<(), String> {
    delete_memory_edge_inner(edge_id, &state)
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
    let graph = state.memory_service().load_graph().await?;
    let node = graph.nodes.into_iter().find(|entry| entry.id == node_id);

    Ok(node.map(|node| MemoryNodeDetailResponse {
        related_ids: graph
            .edges
            .iter()
            .filter_map(|edge| {
                if edge.source_id == node.id {
                    Some(edge.target_id.clone())
                } else if edge.target_id == node.id {
                    Some(edge.source_id.clone())
                } else {
                    None
                }
            })
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect(),
        ..node.into()
    }))
}

async fn load_memory_graph_inner(
    state: &crate::app_state::AppState,
) -> anyhow::Result<MemoryGraphResponse> {
    Ok(state.memory_service().load_graph().await?.into())
}

async fn update_memory_node_inner(
    node_id: String,
    title: String,
    body: Option<String>,
    state: &crate::app_state::AppState,
) -> anyhow::Result<MemoryGraphNodeResponse> {
    state
        .memory_service()
        .update_node(&node_id, title, body)
        .await?
        .map(Into::into)
        .ok_or_else(|| anyhow::anyhow!("memory node not found: {node_id}"))
}

async fn delete_memory_node_inner(
    node_id: String,
    state: &crate::app_state::AppState,
) -> anyhow::Result<()> {
    state.memory_service().delete_node(&node_id).await
}

async fn create_memory_edge_inner(
    edge_id: String,
    source_id: String,
    target_id: String,
    relation: String,
    state: &crate::app_state::AppState,
) -> anyhow::Result<MemoryGraphEdgeResponse> {
    let edge = nuka_domain::memory::MemoryGraphEdge {
        id: edge_id,
        source_id,
        target_id,
        relation,
    };

    Ok(state.memory_service().create_edge(edge).await?.into())
}

async fn delete_memory_edge_inner(
    edge_id: String,
    state: &crate::app_state::AppState,
) -> anyhow::Result<()> {
    state.memory_service().delete_edge(&edge_id).await
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

impl From<nuka_domain::memory::MemoryGraphNode> for MemoryNodeDetailResponse {
    fn from(node: nuka_domain::memory::MemoryGraphNode) -> Self {
        Self {
            id: node.id,
            title: node.title,
            kind: node.kind.as_str().to_string(),
            body: node.body,
            trace_type: node.trace_type.as_str().to_string(),
            consolidation_state: node.consolidation_state.as_str().to_string(),
            related_ids: Vec::new(),
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
    async fn memory_load_graph_returns_nodes_and_edges() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        state
            .memory_service()
            .upsert_node(nuka_domain::memory::MemoryGraphNode {
                id: "memory-review".to_string(),
                kind: nuka_domain::memory::MemoryNodeKind::Fact,
                title: "Review Memory".to_string(),
                body: Some("Tracks the latest review conclusions.".to_string()),
                trace_type: nuka_domain::memory::MemoryTraceType::Semantic,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::None,
            })
            .await
            .unwrap();
        state
            .memory_service()
            .upsert_node(nuka_domain::memory::MemoryGraphNode {
                id: "workflow-review".to_string(),
                kind: nuka_domain::memory::MemoryNodeKind::Workflow,
                title: "Release Workflow".to_string(),
                body: Some("Coordinates release validation.".to_string()),
                trace_type: nuka_domain::memory::MemoryTraceType::Semantic,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::None,
            })
            .await
            .unwrap();
        state
            .memory_service()
            .create_edge(nuka_domain::memory::MemoryGraphEdge {
                id: "edge-review".to_string(),
                source_id: "workflow-review".to_string(),
                target_id: "memory-review".to_string(),
                relation: "captures".to_string(),
            })
            .await
            .unwrap();

        let graph = super::load_memory_graph_inner(&state)
            .await
            .unwrap();

        assert_eq!(graph.nodes.len(), 2);
        assert_eq!(graph.edges.len(), 1);
        assert_eq!(graph.edges[0].relation, "captures");
    }

    #[tokio::test]
    async fn memory_load_graph_includes_trace_and_consolidation_metadata() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        state
            .memory_service()
            .upsert_node(nuka_domain::memory::MemoryGraphNode {
                id: "memory-working".to_string(),
                kind: nuka_domain::memory::MemoryNodeKind::Fact,
                title: "Working Memory".to_string(),
                body: Some("Tracks the latest active cue.".to_string()),
                trace_type: nuka_domain::memory::MemoryTraceType::Working,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::Candidate,
            })
            .await
            .unwrap();

        let graph = super::load_memory_graph_inner(&state).await.unwrap();
        let json = serde_json::to_value(&graph).unwrap();
        let node = json["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["id"] == "memory-working")
            .expect("working memory node should exist");

        assert_eq!(node["traceType"], "working");
        assert_eq!(node["consolidationState"], "candidate");
    }

    #[tokio::test]
    async fn memory_detail_reads_graph_node_metadata() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        state
            .memory_service()
            .upsert_node(nuka_domain::memory::MemoryGraphNode {
                id: "memory-review".to_string(),
                kind: nuka_domain::memory::MemoryNodeKind::Fact,
                title: "Release Review Memory".to_string(),
                body: Some("Tracks blockers, owners, and sign-off notes.".to_string()),
                trace_type: nuka_domain::memory::MemoryTraceType::Semantic,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::None,
            })
            .await
            .unwrap();
        state
            .memory_service()
            .upsert_node(nuka_domain::memory::MemoryGraphNode {
                id: "workflow-review".to_string(),
                kind: nuka_domain::memory::MemoryNodeKind::Workflow,
                title: "Release Workflow".to_string(),
                body: Some("Coordinates release validation.".to_string()),
                trace_type: nuka_domain::memory::MemoryTraceType::Semantic,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::None,
            })
            .await
            .unwrap();
        state
            .memory_service()
            .create_edge(nuka_domain::memory::MemoryGraphEdge {
                id: "edge-review".to_string(),
                source_id: "workflow-review".to_string(),
                target_id: "memory-review".to_string(),
                relation: "captures".to_string(),
            })
            .await
            .unwrap();

        let detail = super::get_memory_node_detail_inner("memory-review".to_string(), &state)
            .await
            .unwrap()
            .expect("detail should exist");

        assert_eq!(detail.title, "Release Review Memory");
        assert_eq!(detail.kind, "fact");
        assert_eq!(
            detail.body.as_deref(),
            Some("Tracks blockers, owners, and sign-off notes."),
        );
        assert_eq!(detail.related_ids, vec!["workflow-review".to_string()]);
    }

    #[tokio::test]
    async fn memory_detail_includes_trace_and_consolidation_metadata() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        state
            .memory_service()
            .upsert_node(nuka_domain::memory::MemoryGraphNode {
                id: "memory-episodic".to_string(),
                kind: nuka_domain::memory::MemoryNodeKind::Fact,
                title: "Episodic Memory".to_string(),
                body: Some("Retains the release-room episode.".to_string()),
                trace_type: nuka_domain::memory::MemoryTraceType::Episodic,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::Approved,
            })
            .await
            .unwrap();

        let detail = super::get_memory_node_detail_inner("memory-episodic".to_string(), &state)
            .await
            .unwrap()
            .expect("detail should exist");
        let json = serde_json::to_value(&detail).unwrap();

        assert_eq!(json["traceType"], "episodic");
        assert_eq!(json["consolidationState"], "approved");
    }

    #[tokio::test]
    async fn memory_detail_deduplicates_related_ids_for_multiple_relations_to_same_peer() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        state
            .memory_service()
            .upsert_node(nuka_domain::memory::MemoryGraphNode {
                id: "memory-review".to_string(),
                kind: nuka_domain::memory::MemoryNodeKind::Fact,
                title: "Release Review Memory".to_string(),
                body: Some("Tracks blockers, owners, and sign-off notes.".to_string()),
                trace_type: nuka_domain::memory::MemoryTraceType::Semantic,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::None,
            })
            .await
            .unwrap();
        state
            .memory_service()
            .upsert_node(nuka_domain::memory::MemoryGraphNode {
                id: "workflow-review".to_string(),
                kind: nuka_domain::memory::MemoryNodeKind::Workflow,
                title: "Release Workflow".to_string(),
                body: Some("Coordinates release validation.".to_string()),
                trace_type: nuka_domain::memory::MemoryTraceType::Semantic,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::None,
            })
            .await
            .unwrap();
        state
            .memory_service()
            .create_edge(nuka_domain::memory::MemoryGraphEdge {
                id: "edge-review-captures".to_string(),
                source_id: "workflow-review".to_string(),
                target_id: "memory-review".to_string(),
                relation: "captures".to_string(),
            })
            .await
            .unwrap();
        state
            .memory_service()
            .create_edge(nuka_domain::memory::MemoryGraphEdge {
                id: "edge-review-blocks".to_string(),
                source_id: "workflow-review".to_string(),
                target_id: "memory-review".to_string(),
                relation: "blocks".to_string(),
            })
            .await
            .unwrap();

        let detail = super::get_memory_node_detail_inner("memory-review".to_string(), &state)
            .await
            .unwrap()
            .expect("detail should exist");

        assert_eq!(detail.related_ids, vec!["workflow-review".to_string()]);
    }

    #[tokio::test]
    async fn memory_create_edge_is_idempotent_for_same_relation() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        state
            .memory_service()
            .upsert_node(nuka_domain::memory::MemoryGraphNode {
                id: "memory-review".to_string(),
                kind: nuka_domain::memory::MemoryNodeKind::Fact,
                title: "Release Review Memory".to_string(),
                body: Some("Tracks blockers, owners, and sign-off notes.".to_string()),
                trace_type: nuka_domain::memory::MemoryTraceType::Semantic,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::None,
            })
            .await
            .unwrap();
        state
            .memory_service()
            .upsert_node(nuka_domain::memory::MemoryGraphNode {
                id: "workflow-review".to_string(),
                kind: nuka_domain::memory::MemoryNodeKind::Workflow,
                title: "Release Workflow".to_string(),
                body: Some("Coordinates release validation.".to_string()),
                trace_type: nuka_domain::memory::MemoryTraceType::Semantic,
                consolidation_state: nuka_domain::memory::MemoryConsolidationState::None,
            })
            .await
            .unwrap();

        let first = super::create_memory_edge_inner(
            "edge-review-a".to_string(),
            "workflow-review".to_string(),
            "memory-review".to_string(),
            "captures".to_string(),
            &state,
        )
        .await
        .unwrap();
        let second = super::create_memory_edge_inner(
            "edge-review-b".to_string(),
            "workflow-review".to_string(),
            "memory-review".to_string(),
            "captures".to_string(),
            &state,
        )
        .await
        .unwrap();

        let graph = super::load_memory_graph_inner(&state).await.unwrap();

        assert_eq!(first.id, "edge-review-a");
        assert_eq!(second.id, "edge-review-a");
        assert_eq!(graph.edges.len(), 1);
    }
}

impl From<nuka_domain::memory::MemoryGraphNode> for MemoryGraphNodeResponse {
    fn from(node: nuka_domain::memory::MemoryGraphNode) -> Self {
        Self {
            id: node.id,
            kind: node.kind.as_str().to_string(),
            title: node.title,
            body: node.body,
            trace_type: node.trace_type.as_str().to_string(),
            consolidation_state: node.consolidation_state.as_str().to_string(),
        }
    }
}

impl From<nuka_domain::memory::MemoryGraphEdge> for MemoryGraphEdgeResponse {
    fn from(edge: nuka_domain::memory::MemoryGraphEdge) -> Self {
        Self {
            id: edge.id,
            source_id: edge.source_id,
            target_id: edge.target_id,
            relation: edge.relation,
        }
    }
}

impl From<nuka_domain::memory::MemoryGraph> for MemoryGraphResponse {
    fn from(graph: nuka_domain::memory::MemoryGraph) -> Self {
        Self {
            nodes: graph.nodes.into_iter().map(Into::into).collect(),
            edges: graph.edges.into_iter().map(Into::into).collect(),
        }
    }
}
