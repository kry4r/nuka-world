use std::{collections::HashMap, sync::{Arc, Mutex}};

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

#[derive(Debug, Clone, Default)]
pub struct WorldRuntime {
    sessions: Arc<Mutex<HashMap<String, crate::session::WorldSession>>>,
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
        let session = crate::session::WorldSession::new();
        self.sessions
            .lock()
            .expect("world sessions lock poisoned")
            .insert(session.id.clone(), session.clone());

        Ok(WorldTurn {
            session,
            route: self.route_prompt(prompt).await?,
        })
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

        Ok(WorldTurn {
            session,
            route: self.route_prompt(prompt).await?,
        })
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
