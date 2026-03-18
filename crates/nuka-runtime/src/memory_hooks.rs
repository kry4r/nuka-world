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
                    "这条对话已进入记忆审核。",
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
        crate::runtime_events::RuntimeEvent::TeamRunStarted {
            run_id,
            team_id,
            prompt,
        } => {
            service
                .record_runtime_candidate(
                    nuka_domain::memory::MemorySurface::Workflow,
                    &run_id,
                    &prompt,
                    "这段协作团队流程已进入记忆审核。",
                    nuka_domain::memory::MemoryScope {
                        id: format!("team:{team_id}"),
                        name: format!("Team {}", workflow_scope_name(&team_id)),
                        workflow_id: Some(format!("team:{team_id}")),
                        session_id: Some(run_id.clone()),
                        agent_id: None,
                    },
                )
                .await?;
        }
        crate::runtime_events::RuntimeEvent::TeamRunRoundCompleted {
            run_id,
            team_id,
            prompt,
        } => {
            service
                .record_runtime_candidate(
                    nuka_domain::memory::MemorySurface::Workflow,
                    &run_id,
                    &prompt,
                    "这轮协作团队流程已进入记忆审核。",
                    nuka_domain::memory::MemoryScope {
                        id: format!("team:{team_id}"),
                        name: format!("Team {}", workflow_scope_name(&team_id)),
                        workflow_id: Some(format!("team:{team_id}")),
                        session_id: Some(run_id.clone()),
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
                    "这段流程已进入记忆审核。",
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
                    "这条流程要点已进入记忆审核。",
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
