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
            .world_runtime()
            .start_session(
                "Summarize the release",
                nuka_runtime::world::WorldChatMode::ChatOnly,
            )
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
}
