use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

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
}

#[derive(Debug, Clone)]
pub struct WorldRuntime {
    chat_service: crate::chat_service::ChatService,
    sessions: Arc<Mutex<HashMap<String, crate::session::WorldSession>>>,
}

impl Default for WorldRuntime {
    fn default() -> Self {
        Self {
            chat_service: crate::chat_service::ChatService::new_for_test_with_default_provider(),
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl WorldRuntime {
    pub fn new_for_test() -> Self {
        Self::default()
    }

    pub async fn route_prompt(&self, prompt: &str) -> anyhow::Result<WorldRoute> {
        if prompt.contains("workflow") {
            Ok(WorldRoute::NewWorkflow)
        } else {
            Ok(WorldRoute::DirectReply)
        }
    }

    pub async fn start_session(&self, prompt: &str) -> anyhow::Result<WorldTurn> {
        let route = self.route_prompt(prompt).await?;
        let session = match route {
            WorldRoute::DirectReply => {
                let turn = self.chat_service.send_message(prompt, None).await?;
                crate::session::WorldSession {
                    id: turn.session.id,
                }
            }
            _ => crate::session::WorldSession::new(),
        };

        self.sessions
            .lock()
            .expect("world sessions lock poisoned")
            .insert(session.id.clone(), session.clone());

        Ok(WorldTurn { session, route })
    }

    pub async fn continue_session(
        &self,
        session_id: &str,
        prompt: &str,
    ) -> anyhow::Result<WorldTurn> {
        let session = self
            .sessions
            .lock()
            .expect("world sessions lock poisoned")
            .get(session_id)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("unknown world session: {session_id}"))?;

        let route = self.route_prompt(prompt).await?;
        if matches!(route, WorldRoute::DirectReply) {
            self.chat_service.send_message(prompt, Some(&session.id)).await?;
        }

        Ok(WorldTurn { session, route })
    }
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn world_routes_simple_prompts_to_direct_reply() {
        let runtime = crate::world::WorldRuntime::new_for_test();
        let result = runtime.route_prompt("summarize today's notes").await.unwrap();
        assert!(matches!(result, crate::world::WorldRoute::DirectReply));
    }

    #[tokio::test]
    async fn world_starts_session_for_prompt() {
        let runtime = crate::world::WorldRuntime::new_for_test();
        let turn = runtime.start_session("summarize today's notes").await.unwrap();

        assert!(!turn.session.id.is_empty());
        assert!(matches!(turn.route, crate::world::WorldRoute::DirectReply));
    }

    #[tokio::test]
    async fn world_continues_existing_session_for_follow_up_prompt() {
        let runtime = crate::world::WorldRuntime::new_for_test();
        let first = runtime.start_session("summarize today's notes").await.unwrap();
        let next = runtime
            .continue_session(&first.session.id, "follow up on those notes")
            .await
            .unwrap();

        assert_eq!(first.session.id, next.session.id);
    }
}
