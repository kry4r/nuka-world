use desktop_tauri::commands::agents::{
    build_agent_draft_record, AgentArchetypeInput, GenerateAgentDraftInput,
};

#[test]
fn build_agent_draft_record_preserves_open_ended_archetype_metadata() {
    let draft = build_agent_draft_record(
        GenerateAgentDraftInput {
            prompt: "Plan next week's errands and recurring household tasks.".to_string(),
            archetype: AgentArchetypeInput {
                key: "household-logistics".to_string(),
                family: "household-logistics".to_string(),
                title: "Household Logistics".to_string(),
                domain_focus: "Household coordination, errands, and personal logistics."
                    .to_string(),
                objective_pattern:
                    "Turn requests into clear plans with timing, owners, and tradeoffs."
                        .to_string(),
                communication_style: "Direct, practical, and low-friction.".to_string(),
                default_tool_posture:
                    "Use only the tools needed to confirm schedules and track tasks."
                        .to_string(),
                memory_posture: "Remember routines, constraints, and recurring obligations."
                    .to_string(),
                escalation_posture:
                    "Escalate when timing, budget, or household constraints conflict."
                        .to_string(),
                safety_posture:
                    "Avoid unsafe recommendations and surface missing details early.".to_string(),
                output_contract: "Action plans, checklists, and concise status updates."
                    .to_string(),
            },
        },
        "provider-local".to_string(),
    )
    .unwrap();

    assert_eq!(draft.provider_id.as_deref(), Some("provider-local"));
    assert_eq!(draft.archetype.family, "household-logistics");
    assert_eq!(draft.archetype.title, "Household Logistics");
    assert!(draft.system_prompt.contains("Household coordination"));
}
