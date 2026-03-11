pub async fn handle_runtime_event(
    service: &crate::memory_service::MemoryService,
    event: crate::runtime_events::RuntimeEvent,
) -> anyhow::Result<()> {
    match event {
        crate::runtime_events::RuntimeEvent::ChatTurnCompleted { session_id, prompt } => {
            service
                .record_runtime_candidate(
                    nuka_domain::memory::MemorySurface::Chat,
                    &session_id,
                    &prompt,
                    "Chat turn proposed for review",
                    nuka_domain::memory::MemoryScope {
                        id: "world".to_string(),
                        name: "World".to_string(),
                        workflow_id: None,
                        session_id: None,
                        agent_id: None,
                    },
                )
                .await?;
        }
        crate::runtime_events::RuntimeEvent::WorkflowSessionStarted {
            session_id,
            workflow_id,
            prompt,
        } => {
            service
                .record_runtime_candidate(
                    nuka_domain::memory::MemorySurface::Workflow,
                    &session_id,
                    &prompt,
                    &format!(
                        "Workflow session {session_id} in {workflow_id} opened for review"
                    ),
                    nuka_domain::memory::MemoryScope {
                        id: format!("workflow:{workflow_id}"),
                        name: workflow_scope_name(&workflow_id),
                        workflow_id: Some(workflow_id.clone()),
                        session_id: None,
                        agent_id: None,
                    },
                )
                .await?;
        }
        crate::runtime_events::RuntimeEvent::WorkflowTurnCompleted {
            session_id,
            workflow_id,
            prompt,
        } => {
            service
                .record_runtime_candidate(
                    nuka_domain::memory::MemorySurface::Workflow,
                    &session_id,
                    &prompt,
                    &format!(
                        "Workflow turn from session {session_id} in {workflow_id} proposed for review"
                    ),
                    nuka_domain::memory::MemoryScope {
                        id: format!("workflow:{workflow_id}"),
                        name: workflow_scope_name(&workflow_id),
                        workflow_id: Some(workflow_id.clone()),
                        session_id: None,
                        agent_id: None,
                    },
                )
                .await?;
        }
    }

    Ok(())
}

fn workflow_scope_name(workflow_id: &str) -> String {
    workflow_id
        .strip_prefix("workflow-")
        .unwrap_or(workflow_id)
        .split('-')
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            let mut chars = segment.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
