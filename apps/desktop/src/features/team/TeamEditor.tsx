import { StatusBadge } from "@/components/ui/StatusBadge";
import type { TeamRecord } from "@/lib/team";
import { TeamAgentCard } from "./TeamAgentCard";

type TeamEditorProps = {
  isSaving: boolean;
  isStartingRun: boolean;
  notice: string | null;
  error: string | null;
  team: TeamRecord | null;
  onSave: () => void;
  onStartRun: () => void;
  onToggleTool: (agentId: string, toolId: string, allowed: boolean) => void;
};

export function TeamEditor({
  isSaving,
  isStartingRun,
  notice,
  error,
  team,
  onSave,
  onStartRun,
  onToggleTool,
}: TeamEditorProps) {
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
                <StatusBadge tone="soft">{team.agents.length} agents</StatusBadge>
              </div>
              <h2>{team.name}</h2>
              <p>{team.summary}</p>
            </div>

            <div className="team-editor__summary-grid">
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
            <button
              className="settings-button settings-button--accent"
              disabled={isStartingRun}
              onClick={onStartRun}
              type="button"
            >
              {isStartingRun ? "Starting..." : "Start Run"}
            </button>
          </div>
        </div>
      ) : (
        <div className="team-editor__empty team-editor__empty--anchored ui-card ui-card--soft">
          <h3 className="ui-card__title team-editor__empty-title">No teams yet</h3>
        </div>
      )}
    </section>
  );
}
