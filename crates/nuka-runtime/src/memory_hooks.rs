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
                )
                .await?;
        }
    }

    Ok(())
}
