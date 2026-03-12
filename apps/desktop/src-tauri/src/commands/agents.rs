use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolBindingSetResponse {
    pub names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentArchetypeInput {
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub provider_id: Option<String>,
    pub tool_names: Vec<String>,
    pub archetype: AgentArchetypeInput,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInput {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub provider_id: Option<String>,
    pub tool_names: Vec<String>,
    pub archetype: AgentArchetypeInput,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateAgentDraftInput {
    pub prompt: String,
    pub archetype: AgentArchetypeInput,
}

#[tauri::command]
pub fn default_agent_tool_bindings() -> ToolBindingSetResponse {
    ToolBindingSetResponse {
        names: default_tool_names(),
    }
}

#[tauri::command]
pub async fn list_agents(
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<Vec<AgentRecord>, String> {
    list_agents_inner(&state)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn save_agent(
    agent: AgentInput,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<AgentRecord, String> {
    save_agent_inner(&state, agent)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_agent(
    agent_id: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<(), String> {
    delete_agent_inner(&state, &agent_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn generate_agent_draft(
    prompt: String,
    archetype: AgentArchetypeInput,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<AgentRecord, String> {
    generate_agent_draft_inner(GenerateAgentDraftInput { prompt, archetype }, &state)
        .await
        .map_err(|error| error.to_string())
}

async fn list_agents_inner(
    state: &crate::app_state::AppState,
) -> anyhow::Result<Vec<AgentRecord>> {
    Ok(state
        .agents_service()
        .list_agents()
        .await?
        .into_iter()
        .map(AgentRecord::from)
        .collect())
}

async fn save_agent_inner(
    state: &crate::app_state::AppState,
    agent: AgentInput,
) -> anyhow::Result<AgentRecord> {
    let preset = agent.into_preset();
    state.agents_service().save_agent(preset.clone()).await?;
    Ok(AgentRecord::from(preset))
}

async fn delete_agent_inner(
    state: &crate::app_state::AppState,
    agent_id: &str,
) -> anyhow::Result<()> {
    state.agents_service().delete_agent(agent_id).await
}

async fn generate_agent_draft_inner(
    input: GenerateAgentDraftInput,
    state: &crate::app_state::AppState,
) -> anyhow::Result<AgentRecord> {
    let provider = state.provider_service().resolve_default_provider().await?;
    build_agent_draft_record(input, provider.id)
}

impl AgentArchetypeInput {
    fn into_domain(self) -> nuka_domain::agent::AgentArchetype {
        nuka_domain::agent::AgentArchetype {
            key: trim_or_default(self.key, "custom"),
            family: trim_or_default(self.family, "custom"),
            title: trim_or_default(self.title, "Custom Archetype"),
            domain_focus: self.domain_focus.trim().to_string(),
            objective_pattern: self.objective_pattern.trim().to_string(),
            communication_style: self.communication_style.trim().to_string(),
            default_tool_posture: self.default_tool_posture.trim().to_string(),
            memory_posture: self.memory_posture.trim().to_string(),
            escalation_posture: self.escalation_posture.trim().to_string(),
            safety_posture: self.safety_posture.trim().to_string(),
            output_contract: self.output_contract.trim().to_string(),
        }
    }
}

impl From<nuka_domain::agent::AgentArchetype> for AgentArchetypeInput {
    fn from(value: nuka_domain::agent::AgentArchetype) -> Self {
        Self {
            key: value.key,
            family: value.family,
            title: value.title,
            domain_focus: value.domain_focus,
            objective_pattern: value.objective_pattern,
            communication_style: value.communication_style,
            default_tool_posture: value.default_tool_posture,
            memory_posture: value.memory_posture,
            escalation_posture: value.escalation_posture,
            safety_posture: value.safety_posture,
            output_contract: value.output_contract,
        }
    }
}

impl AgentInput {
    fn into_preset(self) -> nuka_domain::agent::AgentPreset {
        nuka_domain::agent::AgentPreset {
            id: self.id,
            name: self.name,
            description: self.description,
            system_prompt: self.system_prompt,
            provider_id: self.provider_id,
            archetype: self.archetype.into_domain(),
            knowledge_collection_ids: Vec::new(),
            memory_scope_ids: Vec::new(),
            tool_bindings: self
                .tool_names
                .into_iter()
                .map(nuka_domain::tool::AgentToolBinding::allowed)
                .collect(),
        }
    }
}

impl From<nuka_domain::agent::AgentPreset> for AgentRecord {
    fn from(value: nuka_domain::agent::AgentPreset) -> Self {
        Self {
            id: value.id,
            name: value.name,
            description: value.description,
            system_prompt: value.system_prompt,
            provider_id: value.provider_id,
            tool_names: value
                .tool_bindings
                .into_iter()
                .filter(|binding| binding.allowed)
                .map(|binding| binding.tool_id)
                .collect(),
            archetype: AgentArchetypeInput::from(value.archetype),
        }
    }
}

pub fn build_agent_draft_record(
    input: GenerateAgentDraftInput,
    provider_id: String,
) -> anyhow::Result<AgentRecord> {
    let prompt = input.prompt.trim();
    if prompt.is_empty() {
        anyhow::bail!("agent draft prompt is required");
    }

    let archetype = input.archetype.into_domain();
    let name = draft_name_from_prompt(prompt);

    Ok(AgentRecord {
        id: format!("agent-draft-{}", slugify(&name)),
        name: name.clone(),
        description: draft_description_from_prompt(prompt),
        system_prompt: draft_system_prompt(&name, prompt, &archetype),
        provider_id: Some(provider_id),
        tool_names: default_tool_names(),
        archetype: AgentArchetypeInput::from(archetype),
    })
}

fn default_tool_names() -> Vec<String> {
    nuka_tools::registry::ToolBindingSet::from_names(["codex", "git", "search_knowledge"])
        .into_vec()
}

fn draft_name_from_prompt(prompt: &str) -> String {
    let lower = prompt.to_ascii_lowercase();
    if lower.contains("release digest") || lower.contains("release digests") {
        "Release Digest".to_string()
    } else {
        prompt
            .split_whitespace()
            .take(4)
            .map(|word| word.trim_matches(|character: char| !character.is_alphanumeric()))
            .filter(|word| !word.is_empty())
            .map(|word| {
                let mut characters = word.chars();
                match characters.next() {
                    Some(first) => format!("{}{}", first.to_ascii_uppercase(), characters.as_str()),
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    }
}

fn draft_description_from_prompt(prompt: &str) -> String {
    let lower = prompt.to_ascii_lowercase();
    if lower.contains("weekly") && lower.contains("digest") {
        "Weekly digest writer".to_string()
    } else {
        prompt.to_string()
    }
}

fn draft_system_prompt(
    name: &str,
    prompt: &str,
    archetype: &nuka_domain::agent::AgentArchetype,
) -> String {
    format!(
        "You are {name}.\nArchetype: {} ({})\nDomain focus: {}\nObjective pattern: {}\nCommunication style: {}\nTool posture: {}\nMemory posture: {}\nEscalation posture: {}\nSafety posture: {}\nOutput contract: {}\nTask: {prompt}",
        archetype.title,
        archetype.family,
        archetype.domain_focus,
        archetype.objective_pattern,
        archetype.communication_style,
        archetype.default_tool_posture,
        archetype.memory_posture,
        archetype.escalation_posture,
        archetype.safety_posture,
        archetype.output_contract,
    )
}

fn trim_or_default(value: String, default: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        default.to_string()
    } else {
        trimmed.to_string()
    }
}

fn slugify(value: &str) -> String {
    value
        .to_ascii_lowercase()
        .chars()
        .map(|character| if character.is_ascii_alphanumeric() { character } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

#[cfg(test)]
mod tests {
    fn research_archetype() -> super::AgentArchetypeInput {
        super::AgentArchetypeInput {
            key: "research-analysis".to_string(),
            family: "research-analysis".to_string(),
            title: "Research & Analysis".to_string(),
            domain_focus: "Research, synthesis, and evidence-backed recommendations.".to_string(),
            objective_pattern:
                "Gather context, compare options, and produce a concise brief.".to_string(),
            communication_style: "Calm, cited, and structured.".to_string(),
            default_tool_posture:
                "Use retrieval before generation and keep tool use bounded.".to_string(),
            memory_posture: "Retain durable findings and active watch items only.".to_string(),
            escalation_posture:
                "Escalate when evidence conflicts or confidence is low.".to_string(),
            safety_posture: "Flag missing sources and avoid unsupported claims.".to_string(),
            output_contract: "Summaries with findings, sources, and next actions.".to_string(),
        }
    }

    #[tokio::test]
    async fn agents_list_saved_agents_from_backend() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();

        super::save_agent_inner(
            &state,
            super::AgentInput {
                id: "agent-researcher".to_string(),
                name: "Researcher".to_string(),
                description: "Synthesis and retrieval".to_string(),
                system_prompt: "Summarize findings and cite sources.".to_string(),
                provider_id: Some("provider-local".to_string()),
                tool_names: vec!["codex".to_string(), "search_knowledge".to_string()],
                archetype: research_archetype(),
            },
        )
        .await
        .unwrap();

        let items = super::list_agents_inner(&state).await.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "Researcher");
        assert_eq!(items[0].archetype.family, "research-analysis");
    }

    #[tokio::test]
    async fn agents_generate_draft_with_default_provider() {
        let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
        let provider = nuka_domain::provider::ProviderConfig::openai_compatible(
            "Local",
            "http://localhost:11434/v1",
            "",
            "gpt-oss",
        );
        let provider_id = provider.id.clone();

        state.provider_service().save_provider(provider).await.unwrap();
        state
            .provider_service()
            .set_default_provider(&provider_id)
            .await
            .unwrap();

        let draft = super::generate_agent_draft_inner(
            super::GenerateAgentDraftInput {
                prompt: "Create an agent that writes short weekly release digests.".to_string(),
                archetype: research_archetype(),
            },
            &state,
        )
        .await
        .unwrap();

        assert_eq!(draft.provider_id.as_deref(), Some(provider_id.as_str()));
        assert!(draft.tool_names.iter().any(|tool_name| tool_name == "codex"));
        assert_eq!(draft.archetype.family, "research-analysis");
    }

}
