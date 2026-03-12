use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentArchetype {
    pub key: String,
    pub family: String,
    pub title: String,
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
    pub fn custom(title: impl Into<String>, domain_focus: impl Into<String>) -> Self {
        let title = title.into();
        let trimmed_title = title.trim();

        Self {
            key: "custom".to_string(),
            family: "custom".to_string(),
            title: if trimmed_title.is_empty() {
                "Custom Archetype".to_string()
            } else {
                trimmed_title.to_string()
            },
            domain_focus: domain_focus.into().trim().to_string(),
            objective_pattern: String::new(),
            communication_style: String::new(),
            default_tool_posture: String::new(),
            memory_posture: String::new(),
            escalation_posture: String::new(),
            safety_posture: String::new(),
            output_contract: "Clear outputs matched to the request.".to_string(),
        }
    }

    pub fn inferred_from_agent(name: &str, description: &str) -> Self {
        Self::custom(format!("{name} Archetype"), description)
    }
}

impl Default for AgentArchetype {
    fn default() -> Self {
        Self::custom("Custom Archetype", "")
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
