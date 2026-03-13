import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AgentRecord } from "@/lib/agents";
import type { TeamRecord } from "@/lib/team";
import { TeamAgentCard } from "./TeamAgentCard";

type TeamEditorProps = {
  availableAgents: AgentRecord[];
  isSaving: boolean;
  isStartingRun: boolean;
  team: TeamRecord | null;
  onAddAssignedAgent: (agentId: string) => void;
  onChangeField: (
    field: "summary" | "promptConstraints" | "permissionPolicy",
    value: string,
  ) => void;
  onRemoveAssignedAgent: (agentId: string) => void;
  onSave: () => void;
  onStartRun: () => void;
  onToggleTool: (agentId: string, toolId: string, allowed: boolean) => void;
};

type StructuredValue =
  | {
      kind: "list";
      items: string[];
    }
  | {
      kind: "pairs";
      items: Array<{
        label: string;
        value: string;
      }>;
    }
  | {
      kind: "text";
      value: string;
    };

function humanizeKey(value: string) {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatStructuredValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatStructuredValue(item)).join(", ");
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${humanizeKey(key)}: ${formatStructuredValue(item)}`)
      .join(" · ");
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (value == null) {
    return "None";
  }

  return String(value);
}

function parseStructuredValue(value: string): StructuredValue {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      kind: "text",
      value: "No details yet.",
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (Array.isArray(parsed)) {
      return {
        kind: "list",
        items: parsed.map((item) => formatStructuredValue(item)),
      };
    }

    if (parsed && typeof parsed === "object") {
      return {
        kind: "pairs",
        items: Object.entries(parsed as Record<string, unknown>).map(([key, item]) => ({
          label: humanizeKey(key),
          value: formatStructuredValue(item),
        })),
      };
    }
  } catch {
    // Keep plain-text values readable without forcing JSON parsing.
  }

  return {
    kind: "text",
    value: trimmed,
  };
}

function StructuredValuePreview({ value }: { value: string }) {
  const structured = parseStructuredValue(value);

  if (structured.kind === "list") {
    return (
      <ul className="team-editor__structured-list">
        {structured.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }

  if (structured.kind === "pairs") {
    return (
      <dl className="team-editor__structured-pairs">
        {structured.items.map((item) => (
          <div className="team-editor__structured-pair" key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return <p>{structured.value}</p>;
}

export function TeamEditor({
  availableAgents,
  isSaving,
  isStartingRun,
  team,
  onAddAssignedAgent,
  onChangeField,
  onRemoveAssignedAgent,
  onSave,
  onStartRun,
  onToggleTool,
}: TeamEditorProps) {
  const assignedAgentIds = new Set(team?.agentAssignments.map((assignment) => assignment.agentId) ?? []);
  const unassignedAgents = availableAgents.filter((agent) => !assignedAgentIds.has(agent.id));

  return (
    <section className="team-editor">
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
              <div className="team-editor__summary-card team-editor__summary-card--editable">
                <span>Prompt constraints</span>
                <StructuredValuePreview value={team.promptConstraints} />
                <label className="team-editor__field team-editor__field--compact">
                  <span>Edit source</span>
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
              <div className="team-editor__summary-card team-editor__summary-card--editable">
                <span>Permission policy</span>
                <StructuredValuePreview value={team.permissionPolicy} />
                <label className="team-editor__field team-editor__field--compact">
                  <span>Edit source</span>
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
                <StructuredValuePreview value={team.successCriteria} />
              </div>
              <div className="team-editor__summary-card">
                <span>Coordination</span>
                <StructuredValuePreview value={team.coordinationPolicy} />
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
                    <div className="team-editor__assignment-copy">
                      <strong>{label}</strong>
                      <span>{agent?.responsibility ?? "Assigned to this template."}</span>
                    </div>
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
