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
        self.start_session_with_route(prompt, None).await
    }

    pub async fn start_session_with_route(
        &self,
        prompt: &str,
        route_request: Option<nuka_domain::provider::ProviderRouteRequest>,
    ) -> anyhow::Result<WorldTurn> {
        let chat_turn = self
            .chat_service
            .send_message_with_route(prompt, None, route_request)
            .await?;
        let session = crate::session::WorldSession {
            id: chat_turn.session.id.clone(),
        };

        self.sessions
            .lock()
            .expect("world sessions lock poisoned")
            .insert(session.id.clone(), session.clone());

        Ok(WorldTurn { session, chat_turn })
    }

    pub async fn start_session_with_route_streaming(
        &self,
        prompt: &str,
        route_request: Option<nuka_domain::provider::ProviderRouteRequest>,
        mut on_started: impl FnMut(
            &nuka_domain::chat::ChatSessionSummary,
            &nuka_domain::provider::ProviderConfig,
        ) -> anyhow::Result<()>,
        mut on_delta: impl FnMut(&str) -> anyhow::Result<()>,
    ) -> anyhow::Result<WorldTurn> {
        let chat_turn = self
            .chat_service
            .send_message_with_route_streaming(
                prompt,
                None,
                route_request,
                |session, provider| on_started(session, provider),
                |delta| on_delta(delta),
            )
            .await?;
        let session = crate::session::WorldSession {
            id: chat_turn.session.id.clone(),
        };

        self.sessions
            .lock()
            .expect("world sessions lock poisoned")
            .insert(session.id.clone(), session.clone());

        Ok(WorldTurn { session, chat_turn })
    }

    pub async fn continue_session(
        &self,
        session_id: &str,
        prompt: &str,
    ) -> anyhow::Result<WorldTurn> {
        self.continue_session_with_route(session_id, prompt, None)
            .await
    }

    pub async fn continue_session_with_route(
        &self,
        session_id: &str,
        prompt: &str,
        route_request: Option<nuka_domain::provider::ProviderRouteRequest>,
    ) -> anyhow::Result<WorldTurn> {
        let chat_turn = self
            .chat_service
            .send_message_with_route(prompt, Some(session_id), route_request)
            .await?;
        let session =
            {
                let mut sessions = self.sessions.lock().expect("world sessions lock poisoned");
                let session = sessions.get(session_id).cloned().unwrap_or_else(|| {
                    crate::session::WorldSession {
                        id: chat_turn.session.id.clone(),
                    }
                });
                sessions.insert(session.id.clone(), session.clone());
                session
            };

        Ok(WorldTurn { session, chat_turn })
    }

    pub async fn continue_session_with_route_streaming(
        &self,
        session_id: &str,
        prompt: &str,
        route_request: Option<nuka_domain::provider::ProviderRouteRequest>,
        mut on_started: impl FnMut(
            &nuka_domain::chat::ChatSessionSummary,
            &nuka_domain::provider::ProviderConfig,
        ) -> anyhow::Result<()>,
        mut on_delta: impl FnMut(&str) -> anyhow::Result<()>,
    ) -> anyhow::Result<WorldTurn> {
        let chat_turn = self
            .chat_service
            .send_message_with_route_streaming(
                prompt,
                Some(session_id),
                route_request,
                |session, provider| on_started(session, provider),
                |delta| on_delta(delta),
            )
            .await?;
        let session =
            {
                let mut sessions = self.sessions.lock().expect("world sessions lock poisoned");
                let session = sessions.get(session_id).cloned().unwrap_or_else(|| {
                    crate::session::WorldSession {
                        id: chat_turn.session.id.clone(),
                    }
                });
                sessions.insert(session.id.clone(), session.clone());
                session
            };

        Ok(WorldTurn { session, chat_turn })
    }
}

#[cfg(test)]
mod tests {
    async fn configure_default_provider(
        provider_service: &crate::providers::ProvidersService,
    ) -> String {
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Local",
            "http://localhost:11434/v1",
            "",
            "gpt-oss",
        );
        let provider_id = provider.id.clone();
        provider_service.save_provider(provider).await.unwrap();
        provider_service
            .set_default_provider(&provider_id)
            .await
            .unwrap();
        provider_id
    }

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

    #[tokio::test]
    async fn world_continues_persisted_session_after_runtime_restart() {
        let pool = crate::settings_service::test_pool();
        let provider_service = crate::providers::ProvidersService::new(pool.clone());
        let chat_service =
            crate::chat_service::ChatService::new_for_test_with_seeded_completion_and_provider_service(
                pool,
                provider_service.clone(),
            );
        configure_default_provider(&provider_service).await;

        let first_runtime = crate::world::WorldRuntime::new(chat_service.clone());
        let first = first_runtime
            .start_session("summarize today's notes")
            .await
            .unwrap();

        let restarted_runtime = crate::world::WorldRuntime::new(chat_service);
        let next = restarted_runtime
            .continue_session(&first.session.id, "continue after restart")
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
