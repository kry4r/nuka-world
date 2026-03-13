#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct AgentArchetype {
    pub id: String,
    pub title: String,
    pub family: String,
    pub domain_focus: String,
    pub objective_pattern: String,
    pub communication_style: String,
    pub default_tool_posture: String,
    pub memory_posture: String,
    pub escalation_posture: String,
    pub safety_posture: String,
    pub output_contract: String,
}

impl AgentArchetype {
    pub fn generic() -> Self {
        Self {
            id: "archetype-general".to_string(),
            title: "General Operator".to_string(),
            family: "general".to_string(),
            domain_focus: "General execution".to_string(),
            objective_pattern: "Understand the goal and move it forward".to_string(),
            communication_style: "Clear and pragmatic".to_string(),
            default_tool_posture: "Use the least-cost tool that can finish the work".to_string(),
            memory_posture: "Retain durable context and drop transient chatter".to_string(),
            escalation_posture: "Escalate when blocked or when risk rises".to_string(),
            safety_posture: "Avoid unsupported or destructive actions".to_string(),
            output_contract: "Return a concise actionable result".to_string(),
        }
    }

    pub fn inferred_from_text(name: &str, description: &str) -> Self {
        let combined = format!("{name} {description}").to_ascii_lowercase();
        if combined.contains("research") || combined.contains("analysis") {
            return Self {
                id: "archetype-research".to_string(),
                title: "Research Analyst".to_string(),
                family: "research_and_analysis".to_string(),
                domain_focus: "Research synthesis".to_string(),
                objective_pattern: "Investigate, compare, and summarize".to_string(),
                communication_style: "Calm and evidence-first".to_string(),
                default_tool_posture: "Prefer search and synthesis tools".to_string(),
                memory_posture: "Keep durable findings".to_string(),
                escalation_posture: "Escalate when evidence conflicts".to_string(),
                safety_posture: "Avoid unsupported claims".to_string(),
                output_contract: "Return a findings brief".to_string(),
            };
        }

        if combined.contains("release")
            || combined.contains("coordination")
            || combined.contains("operations")
            || combined.contains("digest")
        {
            return Self {
                id: "archetype-operations".to_string(),
                title: "Operations Coordinator".to_string(),
                family: "operations".to_string(),
                domain_focus: "Operational follow-through".to_string(),
                objective_pattern: "Plan, coordinate, and close loops".to_string(),
                communication_style: "Clear and directive".to_string(),
                default_tool_posture: "Prefer low-cost coordination tools".to_string(),
                memory_posture: "Retain durable checkpoints".to_string(),
                escalation_posture: "Escalate on unresolved blockers".to_string(),
                safety_posture: "Pause before destructive actions".to_string(),
                output_contract: "Return a checkpoint plan".to_string(),
            };
        }

        Self::generic()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentPreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub provider_id: Option<String>,
    pub archetype: AgentArchetype,
    pub knowledge_collection_ids: Vec<String>,
    pub memory_scope_ids: Vec<String>,
    pub tool_bindings: Vec<crate::tool::AgentToolBinding>,
}
