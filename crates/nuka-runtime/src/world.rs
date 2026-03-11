use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorldChatMode {
    ChatOnly,
    CreateWorkflow,
    SpecificWorkflow(String),
}

#[derive(Debug, Clone)]
pub enum WorldRoute {
    DirectReply,
    ExistingWorkflow(String),
    NewWorkflow,
}

#[derive(Debug, Clone)]
pub struct WorldTurn {
    pub session: crate::session::WorldSession,
    pub route: WorldRoute,
    pub chat_turn: Option<crate::chat_service::ChatTurnRecord>,
}

#[derive(Debug, Clone)]
pub struct WorldRuntime {
    chat_service: crate::chat_service::ChatService,
    sessions: Arc<Mutex<HashMap<String, crate::session::WorldSession>>>,
}

impl Default for WorldRuntime {
    fn default() -> Self {
        Self::new(crate::chat_service::ChatService::new_for_test_with_default_provider())
    }
}

impl WorldRuntime {
    pub fn new(chat_service: crate::chat_service::ChatService) -> Self {
        Self {
            chat_service,
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn new_for_test() -> Self {
        Self::default()
    }

    pub async fn route_prompt(
        &self,
        _prompt: &str,
        mode: &WorldChatMode,
    ) -> anyhow::Result<WorldRoute> {
        let route = match mode {
            WorldChatMode::ChatOnly => WorldRoute::DirectReply,
            WorldChatMode::CreateWorkflow => WorldRoute::NewWorkflow,
            WorldChatMode::SpecificWorkflow(workflow_id) => {
                WorldRoute::ExistingWorkflow(workflow_id.clone())
            }
        };

        Ok(route)
    }

    pub async fn start_session(
        &self,
        prompt: &str,
        mode: WorldChatMode,
    ) -> anyhow::Result<WorldTurn> {
        let route = self.route_prompt(prompt, &mode).await?;
        let chat_turn = if matches!(route, WorldRoute::DirectReply) {
            Some(self.chat_service.send_message(prompt, None).await?)
        } else {
            None
        };
        let session = match &chat_turn {
            Some(chat_turn) => crate::session::WorldSession {
                id: chat_turn.session.id.clone(),
                mode: mode.clone(),
            },
            None => crate::session::WorldSession::new(mode.clone()),
        };

        self.sessions
            .lock()
            .expect("world sessions lock poisoned")
            .insert(session.id.clone(), session.clone());

        Ok(WorldTurn {
            session,
            route,
            chat_turn,
        })
    }

    pub async fn continue_session(
        &self,
        session_id: &str,
        prompt: &str,
        next_mode: Option<WorldChatMode>,
    ) -> anyhow::Result<WorldTurn> {
        let session = {
            let mut sessions = self.sessions.lock().expect("world sessions lock poisoned");
            let stored_session = sessions
                .get(session_id)
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("unknown world session: {session_id}"))?;
            let session = crate::session::WorldSession {
                id: stored_session.id,
                mode: next_mode.unwrap_or(stored_session.mode),
            };
            sessions.insert(session.id.clone(), session.clone());
            session
        };

        let route = self.route_prompt(prompt, &session.mode).await?;
        let chat_turn = if matches!(route, WorldRoute::DirectReply) {
            Some(self.chat_service.send_message(prompt, Some(&session.id)).await?)
        } else {
            None
        };

        Ok(WorldTurn {
            session,
            route,
            chat_turn,
        })
    }
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn world_routes_simple_prompts_to_direct_reply() {
        let runtime = crate::world::WorldRuntime::new_for_test();
        let result = runtime
            .route_prompt("summarize today's notes", &crate::world::WorldChatMode::ChatOnly)
            .await
            .unwrap();
        assert!(matches!(result, crate::world::WorldRoute::DirectReply));
    }

    #[tokio::test]
    async fn world_starts_session_for_prompt() {
        let runtime = crate::world::WorldRuntime::new_for_test();
        let turn = runtime
            .start_session("summarize today's notes", crate::world::WorldChatMode::ChatOnly)
            .await
            .unwrap();

        assert!(!turn.session.id.is_empty());
        assert!(matches!(turn.route, crate::world::WorldRoute::DirectReply));
    }

    #[tokio::test]
    async fn world_continues_existing_session_for_follow_up_prompt() {
        let runtime = crate::world::WorldRuntime::new_for_test();
        let first = runtime
            .start_session("summarize today's notes", crate::world::WorldChatMode::ChatOnly)
            .await
            .unwrap();
        let next = runtime
            .continue_session(&first.session.id, "follow up on those notes", None)
            .await
            .unwrap();

        assert_eq!(first.session.id, next.session.id);
    }

    #[tokio::test]
    async fn world_routes_specific_workflow_mode_to_existing_workflow() {
        let runtime = crate::world::WorldRuntime::new_for_test();
        let result = runtime
            .route_prompt(
                "focus on the release checklist",
                &crate::world::WorldChatMode::SpecificWorkflow("workflow-release".to_string()),
            )
            .await
            .unwrap();

        assert!(matches!(
            result,
            crate::world::WorldRoute::ExistingWorkflow(workflow_id)
            if workflow_id == "workflow-release"
        ));
    }

    #[tokio::test]
    async fn world_sessions_preserve_the_chosen_mode() {
        let runtime = crate::world::WorldRuntime::new_for_test();
        let first = runtime
            .start_session(
                "start a release workflow",
                crate::world::WorldChatMode::SpecificWorkflow("workflow-release".to_string()),
            )
            .await
            .unwrap();
        let next = runtime
            .continue_session(&first.session.id, "continue that workflow", None)
            .await
            .unwrap();

        assert!(matches!(
            next.session.mode,
            crate::world::WorldChatMode::SpecificWorkflow(workflow_id)
            if workflow_id == "workflow-release"
        ));
        assert!(matches!(
            next.route,
            crate::world::WorldRoute::ExistingWorkflow(workflow_id)
            if workflow_id == "workflow-release"
        ));
    }

    #[tokio::test]
    async fn world_can_upgrade_an_existing_chat_session_into_a_specific_workflow() {
        let runtime = crate::world::WorldRuntime::new_for_test();
        let first = runtime
            .start_session("summarize today's notes", crate::world::WorldChatMode::ChatOnly)
            .await
            .unwrap();
        let next = runtime
            .continue_session(
                &first.session.id,
                "continue in the release workflow",
                Some(crate::world::WorldChatMode::SpecificWorkflow(
                    "workflow-release".to_string(),
                )),
            )
            .await
            .unwrap();

        assert_eq!(first.session.id, next.session.id);
        assert!(matches!(
            next.session.mode,
            crate::world::WorldChatMode::SpecificWorkflow(workflow_id)
            if workflow_id == "workflow-release"
        ));
        assert!(matches!(
            next.route,
            crate::world::WorldRoute::ExistingWorkflow(workflow_id)
            if workflow_id == "workflow-release"
        ));
    }
}
