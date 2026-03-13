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
    pub lineage: Option<WorkspaceSessionLineageResponse>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSessionLineageResponse {
    pub root_id: String,
    pub parent_id: String,
    pub snapshot_id: String,
    pub anchor_id: String,
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
    },
    TeamRun {
        run: super::team::TeamRunRecord,
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
pub async fn branch_workspace_session(
    session_id: String,
    kind: WorkspaceSessionKindInput,
    anchor_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<WorkspaceSessionResponse, String> {
    branch_workspace_session_inner(session_id, kind, anchor_id, &state)
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

async fn branch_workspace_session_inner(
    session_id: String,
    kind: WorkspaceSessionKindInput,
    anchor_id: String,
    state: &AppState,
) -> anyhow::Result<WorkspaceSessionResponse> {
    Ok(WorkspaceSessionResponse::from(
        state
            .workspace_sessions_service()
            .branch(&session_id, kind.into(), &anchor_id)
            .await?,
    ))
}

impl From<nuka_runtime::workspace_sessions::WorkspaceSessionSummary> for WorkspaceSessionResponse {
    fn from(value: nuka_runtime::workspace_sessions::WorkspaceSessionSummary) -> Self {
        Self {
            id: value.id,
            kind: match value.kind {
                nuka_runtime::workspace_sessions::WorkspaceSessionKind::DirectChat => "direct_chat",
                nuka_runtime::workspace_sessions::WorkspaceSessionKind::TeamRun => "team_run",
            }
            .to_string(),
            title: value.title,
            status: value.status,
            updated_at: value.updated_at,
            lineage: value.lineage.map(WorkspaceSessionLineageResponse::from),
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
            snapshot_id: value.snapshot_id,
            anchor_id: value.anchor_id,
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

impl From<nuka_runtime::workspace_sessions::WorkspaceSessionDetail>
    for WorkspaceSessionDetailResponse
{
    fn from(value: nuka_runtime::workspace_sessions::WorkspaceSessionDetail) -> Self {
        match value {
            nuka_runtime::workspace_sessions::WorkspaceSessionDetail::DirectChat {
                session,
                messages,
            } => Self::DirectChat {
                session: super::chat::ChatSessionResponse::from(session),
                messages: messages
                    .into_iter()
                    .map(super::chat::ChatMessageResponse::from)
                    .collect(),
            },
            nuka_runtime::workspace_sessions::WorkspaceSessionDetail::TeamRun(run) => {
                Self::TeamRun {
                    run: super::team::TeamRunRecord::from(run),
                }
            }
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
        state
            .provider_service()
            .save_provider(provider)
            .await
            .unwrap();
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
            .world_runtime()
            .start_session("Summarize the release")
            .await
            .unwrap();
        let team = crate::commands::team::create_team_from_goal_inner(
            "Ship the release".to_string(),
            &state,
        )
        .await
        .unwrap();
        crate::commands::team::start_team_run_inner(team.id, &state)
            .await
            .unwrap();

        let sessions = super::list_workspace_sessions_inner(&state).await.unwrap();
        assert!(sessions.iter().any(|session| session.kind == "direct_chat"));
        assert!(sessions.iter().any(|session| session.kind == "team_run"));
    }

    #[tokio::test]
    async fn workspace_commands_branch_direct_chat_from_message_anchor() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        configure_default_provider(&state).await;

        let first = crate::commands::chat::route_world_prompt_inner(
            "Summarize the release".to_string(),
            None,
            &state,
        )
        .await
        .unwrap();

        let branch = super::branch_workspace_session_inner(
            first.session.id.clone(),
            super::WorkspaceSessionKindInput::DirectChat,
            first.messages[1].id.clone(),
            &state,
        )
        .await
        .unwrap();

        let sessions = super::list_workspace_sessions_inner(&state).await.unwrap();
        let branch_session = sessions
            .iter()
            .find(|session| session.id == branch.id)
            .unwrap();

        assert_eq!(branch.kind, "direct_chat");
        assert_eq!(branch_session.kind, "direct_chat");
        assert_ne!(branch.id, first.session.id);
        assert_eq!(
            branch
                .lineage
                .as_ref()
                .map(|lineage| lineage.parent_id.as_str()),
            Some(first.session.id.as_str())
        );
        assert_eq!(
            branch_session
                .lineage
                .as_ref()
                .map(|lineage| lineage.anchor_id.as_str()),
            Some(first.messages[1].id.as_str())
        );
    }

    #[tokio::test]
    async fn workspace_commands_branch_team_run_from_event_anchor() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        configure_default_provider(&state).await;

        let team = crate::commands::team::create_team_from_goal_inner(
            "Ship the release".to_string(),
            &state,
        )
        .await
        .unwrap();
        let run = crate::commands::team::start_team_run_inner(team.id, &state)
            .await
            .unwrap();
        let anchor_title = run.events[0].title.clone();

        let branch = super::branch_workspace_session_inner(
            run.id.clone(),
            super::WorkspaceSessionKindInput::TeamRun,
            run.events[0].id.clone(),
            &state,
        )
        .await
        .unwrap();

        let loaded = super::load_workspace_session_inner(
            branch.id.clone(),
            super::WorkspaceSessionKindInput::TeamRun,
            &state,
        )
        .await
        .unwrap()
        .unwrap();

        assert_eq!(branch.kind, "team_run");
        assert_eq!(
            branch
                .lineage
                .as_ref()
                .map(|lineage| lineage.parent_id.as_str()),
            Some(run.id.as_str())
        );
        match loaded {
            super::WorkspaceSessionDetailResponse::TeamRun { run } => {
                assert_eq!(run.events.len(), 1);
                assert_eq!(run.events[0].title, anchor_title);
            }
            other => panic!("expected branched team run detail, got {other:?}"),
        }
    }
}
