pub enum WorldRoute {
    DirectReply,
    ExistingWorkflow(String),
    NewWorkflow,
}

pub struct WorldRuntime;

impl WorldRuntime {
    pub fn new_for_test() -> Self {
        Self
    }

    pub async fn route_prompt(&self, prompt: &str) -> anyhow::Result<WorldRoute> {
        if prompt.contains("workflow") {
            Ok(WorldRoute::NewWorkflow)
        } else {
            Ok(WorldRoute::DirectReply)
        }
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
}
