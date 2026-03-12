use nuka_domain::{
    agent::{AgentArchetype, AgentPreset},
    tool::AgentToolBinding,
};

fn sample_archetype() -> AgentArchetype {
    AgentArchetype {
        key: "household-logistics".to_string(),
        family: "household-logistics".to_string(),
        title: "Household Logistics".to_string(),
        domain_focus: "Household coordination, errands, and personal logistics.".to_string(),
        objective_pattern: "Turn requests into clear plans with owners, timing, and tradeoffs."
            .to_string(),
        communication_style: "Direct, practical, and low-friction.".to_string(),
        default_tool_posture:
            "Use only the tools needed to confirm schedules and track tasks.".to_string(),
        memory_posture: "Remember routines, constraints, and recurring obligations.".to_string(),
        escalation_posture:
            "Escalate when timing, budget, or household constraints conflict.".to_string(),
        safety_posture: "Avoid unsafe recommendations and surface missing details early."
            .to_string(),
        output_contract: "Action plans, checklists, and concise status updates.".to_string(),
    }
}

#[tokio::test]
async fn upsert_and_list_round_trip_agent_archetype_metadata() {
    let db = nuka_storage::db::open_in_memory().await.unwrap();
    nuka_storage::migrations::run(&db).await.unwrap();

    let repo = nuka_storage::agents::AgentRepository::new(db);
    repo.upsert(AgentPreset {
        id: "agent-household".to_string(),
        name: "Household Planner".to_string(),
        description: "Coordinates errands and routines".to_string(),
        system_prompt: "Plan household work clearly and safely.".to_string(),
        provider_id: Some("provider-local".to_string()),
        archetype: sample_archetype(),
        knowledge_collection_ids: Vec::new(),
        memory_scope_ids: Vec::new(),
        tool_bindings: vec![AgentToolBinding::allowed("search_knowledge")],
    })
    .await
    .unwrap();

    let items = repo.list().await.unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].archetype, sample_archetype());
}
