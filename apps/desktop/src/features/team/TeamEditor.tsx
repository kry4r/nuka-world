import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AgentRecord } from "@/lib/agents";
import type { TeamRecord } from "@/lib/team";
import { TeamAgentCard } from "./TeamAgentCard";

type TeamEditorProps = {
  availableAgents: AgentRecord[];
  isSaving: boolean;
  notice: string | null;
  error: string | null;
  team: TeamRecord | null;
  onAddAssignedAgent: (agentId: string) => void;
  onChangeField: (
    field: "summary" | "promptConstraints" | "permissionPolicy",
    value: string,
  ) => void;
  onRemoveAssignedAgent: (agentId: string) => void;
  onSave: () => void;
  onToggleTool: (agentId: string, toolId: string, allowed: boolean) => void;
};

export function TeamEditor({
  availableAgents,
  isSaving,
  notice,
  error,
  team,
  onAddAssignedAgent,
  onChangeField,
  onRemoveAssignedAgent,
  onSave,
  onToggleTool,
}: TeamEditorProps) {
  const assignedAgentIds = new Set(team?.agentAssignments.map((assignment) => assignment.agentId) ?? []);
  const unassignedAgents = availableAgents.filter((agent) => !assignedAgentIds.has(agent.id));

  return (
    <section className="team-editor">
      {error ? <div className="team-editor__error">{error}</div> : null}
      {notice ? <div className="team-editor__notice">{notice}</div> : null}

      {team ? (
        <div className="team-editor__detail" data-testid="team-detail">
          <div className="team-editor__summary">
            <div className="team-editor__summary-copy">
              <div className="team-editor__summary-badges">
                <StatusBadge tone="accent">{team.status}</StatusBadge>
                <StatusBadge tone="soft">{team.agentAssignments.length} assigned</StatusBadge>
              </div>
              <h2>{team.name}</h2>
              <label className="team-editor__field">
                <span>Team description</span>
                <textarea
                  aria-label="Team description"
                  onChange={(event) => onChangeField("summary", event.target.value)}
                  rows={4}
                  value={team.summary}
                />
              </label>
            </div>

            <div className="team-editor__summary-grid">
              <div className="team-editor__summary-card">
                <label className="team-editor__field">
                  <span>Prompt constraints</span>
                  <textarea
                    aria-label="Prompt constraints"
                    onChange={(event) =>
                      onChangeField("promptConstraints", event.target.value)
                    }
                    rows={4}
                    value={team.promptConstraints}
                  />
                </label>
              </div>
              <div className="team-editor__summary-card">
                <label className="team-editor__field">
                  <span>Permission policy</span>
                  <textarea
                    aria-label="Permission policy"
                    onChange={(event) =>
                      onChangeField("permissionPolicy", event.target.value)
                    }
                    rows={4}
                    value={team.permissionPolicy}
                  />
                </label>
              </div>
              <div className="team-editor__summary-card">
                <span>Success criteria</span>
                <p>{team.successCriteria}</p>
              </div>
              <div className="team-editor__summary-card">
                <span>Coordination</span>
                <p>{team.coordinationPolicy}</p>
              </div>
            </div>
          </div>

          <div className="team-editor__assignments">
            <div className="team-editor__assignment-list">
              <h3>Assigned agents</h3>
              {team.agentAssignments.map((assignment, index) => {
                const agent = team.agents[index];
                const label = agent?.name ?? assignment.agentId;

                return (
                  <div className="team-editor__assignment-row" key={assignment.id}>
                    <span>{label}</span>
                    <button onClick={() => onRemoveAssignedAgent(assignment.agentId)} type="button">
                      Remove {label}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="team-editor__assignment-list">
              <h3>Available agents</h3>
              {unassignedAgents.length === 0 ? (
                <div className="team-editor__assignment-empty">All saved agents are assigned.</div>
              ) : (
                unassignedAgents.map((agent) => (
                  <button key={agent.id} onClick={() => onAddAssignedAgent(agent.id)} type="button">
                    Add {agent.name}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="team-editor__agents">
            {team.agents.map((agent) => (
              <TeamAgentCard
                agent={agent}
                key={agent.id}
                onToggleTool={onToggleTool}
              />
            ))}
          </div>

          <div className="team-editor__actions">
            <button
              className="settings-button"
              disabled={isSaving}
              onClick={onSave}
              type="button"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      ) : (
        <div
          className="team-editor__empty team-editor__empty--centered"
          data-testid="team-editor-empty"
        >
          No teams yet.
        </div>
      )}
    </section>
  );
}
