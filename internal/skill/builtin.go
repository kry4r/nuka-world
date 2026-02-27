package skill

// RegisterBuiltins adds the default built-in skills to the manager.
func RegisterBuiltins(mgr *Manager) {
	builtins := []*Skill{
		{
			ID:          "web_search",
			Name:        "web_search",
			Description: "Search the web for current information",
			PromptFragment: "You have the ability to search the web for current information. " +
				"Use the web search tool when the user asks about recent events, current data, " +
				"or anything that requires up-to-date information beyond your training data.",
			ToolNames: []string{"mcp:web-search:search"},
			Source:    "builtin",
		},
		{
			ID:          "memory_recall",
			Name:        "memory_recall",
			Description: "Deep memory search via RAG",
			PromptFragment: "You have access to a deep memory system powered by RAG. " +
				"Use rag_search to find relevant past conversations, documents, and world events. " +
				"Use rag_store to save important information for future recall.",
			ToolNames: []string{"rag_search", "rag_store"},
			Source:    "builtin",
		},
		{
			ID:          "task_planning",
			Name:        "task_planning",
			Description: "Break down complex tasks into actionable steps",
			PromptFragment: "You can break down complex tasks into steps and create schedules. " +
				"Use create_schedule to set up recurring or one-time tasks. " +
				"Use send_message to coordinate with other agents.",
			ToolNames: []string{"create_schedule", "send_message"},
			Source:    "builtin",
		},
		{
			ID:          "world_observer",
			Name:        "world_observer",
			Description: "Monitor and interact with world simulation events",
			PromptFragment: "You can observe the world simulation state, including time, " +
				"weather, agent activities, and scheduled events. Use get_world_state " +
				"to check current conditions and get_schedules to see upcoming events.",
			ToolNames: []string{"get_world_state", "get_schedules"},
			Source:    "builtin",
		},
	}
	for _, s := range builtins {
		mgr.Add(s)
	}
}
