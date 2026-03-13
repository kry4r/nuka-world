use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

#[derive(Debug, Clone)]
pub struct WorldTurn {
    pub session: crate::session::WorldSession,
    pub chat_turn: crate::chat_service::ChatTurnRecord,
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

    pub async fn start_session(&self, prompt: &str) -> anyhow::Result<WorldTurn> {
        let chat_turn = self.chat_service.send_message(prompt, None).await?;
        let session = crate::session::WorldSession {
            id: chat_turn.session.id.clone(),
        };

        self.sessions
            .lock()
            .expect("world sessions lock poisoned")
            .insert(session.id.clone(), session.clone());

        Ok(WorldTurn {
            session,
            chat_turn,
        })
    }

    pub async fn continue_session(&self, session_id: &str, prompt: &str) -> anyhow::Result<WorldTurn> {
        let session = {
            let mut sessions = self.sessions.lock().expect("world sessions lock poisoned");
            let session = sessions
                .get(session_id)
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("unknown world session: {session_id}"))?;
            sessions.insert(session.id.clone(), session.clone());
            session
        };

        let chat_turn = self.chat_service.send_message(prompt, Some(&session.id)).await?;

        Ok(WorldTurn {
            session,
            chat_turn,
        })
    }
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn world_starts_session_for_prompt() {
        let runtime = crate::world::WorldRuntime::new_for_test();
        let turn = runtime
            .start_session("summarize today's notes")
            .await
            .unwrap();

        assert!(!turn.session.id.is_empty());
        assert_eq!(turn.chat_turn.session.id, turn.session.id);
    }

    #[tokio::test]
    async fn world_continues_existing_session_for_follow_up_prompt() {
        let runtime = crate::world::WorldRuntime::new_for_test();
        let first = runtime
            .start_session("summarize today's notes")
            .await
            .unwrap();
        let next = runtime
            .continue_session(&first.session.id, "follow up on those notes")
            .await
            .unwrap();

        assert_eq!(first.session.id, next.session.id);
    }

    #[test]
    fn world_runtime_source_removes_workflow_routing_variants() {
        let source = std::fs::read_to_string("src/world.rs").unwrap();
        let non_test_region = source
            .split("#[cfg(test)]")
            .next()
            .expect("world.rs should contain a non-test region");

        for forbidden in [
            "CreateWorkflow",
            "SpecificWorkflow",
            "ExistingWorkflow",
            "NewWorkflow",
            "workflow_id",
        ] {
            assert!(
                !non_test_region.contains(forbidden),
                "workflow residue should be removed from world runtime: {forbidden}"
            );
        }
    }
}
