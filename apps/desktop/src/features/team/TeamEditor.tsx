import { StatusBadge } from "@/components/ui/StatusBadge";
import type { TeamRecord } from "@/lib/team";
import { TeamAgentCard } from "./TeamAgentCard";

type TeamEditorProps = {
  goal: string;
  isGenerating: boolean;
  isSaving: boolean;
  isStartingRun: boolean;
  notice: string | null;
  error: string | null;
  team: TeamRecord | null;
  onGenerate: () => void;
  onGoalChange: (value: string) => void;
  onSave: () => void;
  onStartRun: () => void;
  onToggleTool: (agentId: string, toolId: string, allowed: boolean) => void;
};

export function TeamEditor({
  goal,
  isGenerating,
  isSaving,
  isStartingRun,
  notice,
  error,
  team,
  onGenerate,
  onGoalChange,
  onSave,
  onStartRun,
  onToggleTool,
}: TeamEditorProps) {
  return (
    <section className="team-editor">
      <div className="team-editor__generator ui-card">
        <div className="team-editor__generator-copy">
          <span className="team-editor__eyebrow">Team</span>
          <h2>Generate a Team from a goal</h2>
          <p>Use the saved provider to draft explicit agents with bounded tool access.</p>
        </div>

        <div className="team-editor__generator-form">
          <label className="team-editor__field">
            <span className="team-editor__field-label">Team goal</span>
            <input
              aria-label="Team goal"
              className="field-input"
              onChange={(event) => onGoalChange(event.target.value)}
              value={goal}
            />
          </label>

          <button
            className="settings-button settings-button--accent"
            disabled={goal.trim().length === 0 || isGenerating}
            onClick={onGenerate}
            type="button"
          >
            {isGenerating ? "Generating..." : "Generate Team"}
          </button>
        </div>
      </div>

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
        <div className="team-editor__empty ui-card ui-card--soft">
          <h3 className="ui-card__title">No team selected</h3>
          <p className="ui-card__description">
            Generate a team from a concrete goal to review agents, tool bindings, and run setup.
          </p>
        </div>
      )}
    </section>
  );
}
