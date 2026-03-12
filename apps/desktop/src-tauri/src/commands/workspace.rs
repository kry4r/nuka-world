use crate::app_state::AppState;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSessionResponse {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub status: String,
    pub updated_at: String,
    pub lineage: WorkspaceSessionLineageResponse,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSessionLineageResponse {
    pub root_id: String,
    pub parent_id: Option<String>,
    pub branch_snapshot_id: Option<String>,
    pub branched_from_item_id: Option<String>,
    pub branch_depth: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSessionSnapshotResponse {
    pub id: String,
    pub anchor_id: String,
    pub anchor_kind: String,
    pub anchor_index: i64,
    pub title: String,
    pub excerpt: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceSessionKindInput {
    DirectChat,
    TeamRun,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WorkspaceSessionDetailResponse {
    DirectChat {
        session: super::chat::ChatSessionResponse,
        messages: Vec<super::chat::ChatMessageResponse>,
        lineage: WorkspaceSessionLineageResponse,
        snapshots: Vec<WorkspaceSessionSnapshotResponse>,
    },
    TeamRun {
        run: super::team::TeamRunRecord,
        lineage: WorkspaceSessionLineageResponse,
        snapshots: Vec<WorkspaceSessionSnapshotResponse>,
    },
}

#[tauri::command]
pub async fn list_workspace_sessions(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<WorkspaceSessionResponse>, String> {
    list_workspace_sessions_inner(&state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn load_workspace_session(
    session_id: String,
    kind: WorkspaceSessionKindInput,
    state: tauri::State<'_, AppState>,
) -> Result<Option<WorkspaceSessionDetailResponse>, String> {
    load_workspace_session_inner(session_id, kind, &state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn create_workspace_session_branch(
    session_id: String,
    kind: WorkspaceSessionKindInput,
    anchor_id: String,
    branch_title: String,
    state: tauri::State<'_, AppState>,
) -> Result<WorkspaceSessionDetailResponse, String> {
    create_workspace_session_branch_inner(session_id, kind, anchor_id, branch_title, &state)
        .await
        .map_err(|error| error.to_string())
}

pub(crate) async fn list_workspace_sessions_inner(
    state: &AppState,
) -> anyhow::Result<Vec<WorkspaceSessionResponse>> {
    Ok(state
        .workspace_sessions_service()
        .list()
        .await?
        .into_iter()
        .map(WorkspaceSessionResponse::from)
        .collect())
}

async fn load_workspace_session_inner(
    session_id: String,
    kind: WorkspaceSessionKindInput,
    state: &AppState,
) -> anyhow::Result<Option<WorkspaceSessionDetailResponse>> {
    Ok(state
        .workspace_sessions_service()
        .load(&session_id, kind.into())
        .await?
        .map(WorkspaceSessionDetailResponse::from))
}

pub(crate) async fn create_workspace_session_branch_inner(
    session_id: String,
    kind: WorkspaceSessionKindInput,
    anchor_id: String,
    branch_title: String,
    state: &AppState,
) -> anyhow::Result<WorkspaceSessionDetailResponse> {
    Ok(WorkspaceSessionDetailResponse::from(
        state
            .workspace_sessions_service()
            .create_branch(&session_id, kind.into(), &anchor_id, &branch_title)
            .await?,
    ))
}

impl From<nuka_runtime::workspace_sessions::WorkspaceSessionSummary> for WorkspaceSessionResponse {
    fn from(value: nuka_runtime::workspace_sessions::WorkspaceSessionSummary) -> Self {
        Self {
            id: value.id,
            kind: match value.kind {
                nuka_runtime::workspace_sessions::WorkspaceSessionKind::DirectChat => {
                    "direct_chat"
                }
                nuka_runtime::workspace_sessions::WorkspaceSessionKind::TeamRun => "team_run",
            }
            .to_string(),
            title: value.title,
            status: value.status,
            updated_at: value.updated_at,
            lineage: WorkspaceSessionLineageResponse::from(value.lineage),
        }
    }
}

impl From<WorkspaceSessionKindInput> for nuka_runtime::workspace_sessions::WorkspaceSessionKind {
    fn from(value: WorkspaceSessionKindInput) -> Self {
        match value {
            WorkspaceSessionKindInput::DirectChat => Self::DirectChat,
            WorkspaceSessionKindInput::TeamRun => Self::TeamRun,
        }
    }
}

impl From<nuka_runtime::workspace_sessions::WorkspaceSessionDetail> for WorkspaceSessionDetailResponse {
    fn from(value: nuka_runtime::workspace_sessions::WorkspaceSessionDetail) -> Self {
        match value {
            nuka_runtime::workspace_sessions::WorkspaceSessionDetail::DirectChat {
                session,
                messages,
                lineage,
                snapshots,
            } => Self::DirectChat {
                session: super::chat::ChatSessionResponse::from(session),
                messages: messages
                    .into_iter()
                    .map(super::chat::ChatMessageResponse::from)
                    .collect(),
                lineage: WorkspaceSessionLineageResponse::from(lineage),
                snapshots: snapshots
                    .into_iter()
                    .map(WorkspaceSessionSnapshotResponse::from)
                    .collect(),
            },
            nuka_runtime::workspace_sessions::WorkspaceSessionDetail::TeamRun {
                run,
                lineage,
                snapshots,
            } => {
                Self::TeamRun {
                    run: super::team::TeamRunRecord::from(run),
                    lineage: WorkspaceSessionLineageResponse::from(lineage),
                    snapshots: snapshots
                        .into_iter()
                        .map(WorkspaceSessionSnapshotResponse::from)
                        .collect(),
                }
            }
        }
    }
}

impl From<nuka_runtime::workspace_sessions::WorkspaceSessionLineage>
    for WorkspaceSessionLineageResponse
{
    fn from(value: nuka_runtime::workspace_sessions::WorkspaceSessionLineage) -> Self {
        Self {
            root_id: value.root_id,
            parent_id: value.parent_id,
            branch_snapshot_id: value.branch_snapshot_id,
            branched_from_item_id: value.branched_from_item_id,
            branch_depth: value.branch_depth,
        }
    }
}

impl From<nuka_runtime::workspace_sessions::WorkspaceSessionSnapshot>
    for WorkspaceSessionSnapshotResponse
{
    fn from(value: nuka_runtime::workspace_sessions::WorkspaceSessionSnapshot) -> Self {
        Self {
            id: value.id,
            anchor_id: value.anchor_id,
            anchor_kind: value.anchor_kind,
            anchor_index: value.anchor_index,
            title: value.title,
            excerpt: value.excerpt,
            created_at: value.created_at,
        }
    }
}

#[cfg(test)]
mod tests {
    async fn configure_default_provider(state: &crate::app_state::AppState) {
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Local",
            "http://localhost:11434/v1",
            "",
            "gpt-oss",
        );
        let provider_id = provider.id.clone();
        state.provider_service().save_provider(provider).await.unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn workspace_commands_list_direct_chats_and_team_runs() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        configure_default_provider(&state).await;

        state
            .chat_service()
            .send_message("Summarize the release", None)
            .await
            .unwrap();
        let team = crate::commands::team::create_team_from_goal_inner(
            "Ship the release".to_string(),
            &state,
        )
        .await
        .unwrap();
        crate::commands::team::start_team_run_inner(team.id, None, &state)
            .await
            .unwrap();

        let sessions = super::list_workspace_sessions_inner(&state).await.unwrap();
        assert!(sessions.iter().any(|session| session.kind == "direct_chat"));
        assert!(sessions.iter().any(|session| session.kind == "team_run"));
    }

    #[tokio::test]
    async fn workspace_commands_branch_direct_chats_and_expose_lineage_metadata() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        configure_default_provider(&state).await;

        let original = state
            .chat_service()
            .send_message("Summarize the release blockers", None)
            .await
            .unwrap();
        let anchor_message_id = original.messages[1].id.clone();

        let branch = super::create_workspace_session_branch_inner(
            original.session.id.clone(),
            super::WorkspaceSessionKindInput::DirectChat,
            anchor_message_id.clone(),
            "Release blockers / branch".to_string(),
            &state,
        )
        .await
        .unwrap();

        let branch_json = serde_json::to_value(&branch).unwrap();
        assert_eq!(branch_json["kind"], "direct_chat");
        assert_eq!(branch_json["lineage"]["rootId"], original.session.id);
        assert_eq!(branch_json["lineage"]["parentId"], original.session.id);
        assert_eq!(
            branch_json["lineage"]["branchedFromItemId"],
            anchor_message_id
        );
        assert_eq!(branch_json["messages"].as_array().unwrap().len(), 2);

        let sessions = super::list_workspace_sessions_inner(&state).await.unwrap();
        let branch_id = branch_json["session"]["id"].as_str().unwrap();
        let branch_summary = sessions
            .iter()
            .find(|session| session.id == branch_id)
            .unwrap();
        let branch_summary_json = serde_json::to_value(branch_summary).unwrap();
        assert_eq!(branch_summary_json["lineage"]["branchDepth"], 1);

        let original_detail = super::load_workspace_session_inner(
            original.session.id.clone(),
            super::WorkspaceSessionKindInput::DirectChat,
            &state,
        )
        .await
        .unwrap()
        .unwrap();
        let original_detail_json = serde_json::to_value(&original_detail).unwrap();
        assert_eq!(original_detail_json["snapshots"][0]["anchorId"], anchor_message_id);
    }

    #[tokio::test]
    async fn workspace_commands_branch_team_runs_and_expose_lineage_metadata() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        configure_default_provider(&state).await;

        let team = crate::commands::team::create_team_from_goal_inner(
            "Ship the release".to_string(),
            &state,
        )
        .await
        .unwrap();
        let run = crate::commands::team::start_team_run_inner(team.id.clone(), None, &state)
            .await
            .unwrap();
        let anchor_event_id = run
            .events
            .iter()
            .find(|event| event.kind == "checkpoint_summary")
            .unwrap()
            .id
            .clone();

        let branch = super::create_workspace_session_branch_inner(
            run.id.clone(),
            super::WorkspaceSessionKindInput::TeamRun,
            anchor_event_id.clone(),
            "Release team run / branch".to_string(),
            &state,
        )
        .await
        .unwrap();

        let branch_json = serde_json::to_value(&branch).unwrap();
        assert_eq!(branch_json["kind"], "team_run");
        assert_eq!(branch_json["lineage"]["rootId"], run.id);
        assert_eq!(branch_json["lineage"]["parentId"], run.id);
        assert_eq!(
            branch_json["lineage"]["branchedFromItemId"],
            anchor_event_id
        );

        let original_detail = super::load_workspace_session_inner(
            run.id.clone(),
            super::WorkspaceSessionKindInput::TeamRun,
            &state,
        )
        .await
        .unwrap()
        .unwrap();
        let original_detail_json = serde_json::to_value(&original_detail).unwrap();
        assert_eq!(original_detail_json["snapshots"][0]["anchorId"], anchor_event_id);
    }
}
