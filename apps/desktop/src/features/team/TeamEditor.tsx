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
    field:
      | "summary"
      | "promptConstraints"
      | "permissionPolicy"
      | "successCriteria"
      | "coordinationPolicy",
    value: string,
  ) => void;
  onRemoveAssignedAgent: (agentId: string) => void;
  onSave: () => void;
  onStartRun: () => void;
  onToggleTool: (agentId: string, toolId: string, allowed: boolean) => void;
};

type PairEntry = {
  key: string;
  value: string;
};

type PermissionPolicyState = {
  allowedResources: string[];
  deniedActions: string[];
  maxExecutionTimeMinutes: string;
  extras: Record<string, unknown>;
};

type CoordinationPolicyState = {
  flow: string;
  feedbackLoop: string;
  errorHandling: string;
  roleHierarchy: PairEntry[];
  extras: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseJsonRecord(value: string): Record<string, unknown> {
  const parsed = parseJsonValue(value);
  return isRecord(parsed) ? parsed : {};
}

function parseStringArray(value: string): string[] {
  const parsed = parseJsonValue(value);

  if (!Array.isArray(parsed)) {
    return value.trim() ? [value.trim()] : [];
  }

  return parsed.map((item) => String(item));
}

function formatInputValue(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return String(value);
}

function ensureEditableList(items: string[]): string[] {
  return items.length > 0 ? items : [""];
}

function ensureEditablePairs(entries: PairEntry[]): PairEntry[] {
  return entries.length > 0 ? entries : [{ key: "", value: "" }];
}

function coerceInputValue(value: string): unknown {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  return trimmed;
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parsePermissionPolicy(value: string): PermissionPolicyState {
  const record = parseJsonRecord(value);
  const { allowedResources, deniedActions, maxExecutionTimeMinutes, ...extras } = record;

  return {
    allowedResources: Array.isArray(allowedResources)
      ? allowedResources.map((item) => String(item))
      : [],
    deniedActions: Array.isArray(deniedActions) ? deniedActions.map((item) => String(item)) : [],
    maxExecutionTimeMinutes: formatInputValue(maxExecutionTimeMinutes),
    extras,
  };
}

function serializePermissionPolicy(state: PermissionPolicyState): string {
  return stringifyJson({
    ...state.extras,
    allowedResources: state.allowedResources.map((item) => item.trim()).filter(Boolean),
    deniedActions: state.deniedActions.map((item) => item.trim()).filter(Boolean),
    maxExecutionTimeMinutes: state.maxExecutionTimeMinutes.trim()
      ? coerceInputValue(state.maxExecutionTimeMinutes)
      : null,
  });
}

function parsePairEntries(value: string): PairEntry[] {
  return Object.entries(parseJsonRecord(value)).map(([entryKey, entryValue]) => ({
    key: entryKey,
    value: formatInputValue(entryValue),
  }));
}

function serializePairEntries(entries: PairEntry[]): string {
  const record: Record<string, unknown> = {};

  for (const entry of entries) {
    const normalizedKey = entry.key.trim();
    if (!normalizedKey) {
      continue;
    }

    record[normalizedKey] = coerceInputValue(entry.value);
  }

  return stringifyJson(record);
}

function parseCoordinationPolicy(value: string): CoordinationPolicyState {
  const record = parseJsonRecord(value);
  const { flow, feedbackLoop, errorHandling, roleHierarchy, ...extras } = record;
  const hierarchyEntries = isRecord(roleHierarchy)
    ? Object.entries(roleHierarchy).map(([entryKey, entryValue]) => ({
        key: entryKey,
        value: formatInputValue(entryValue),
      }))
    : [];

  return {
    flow: formatInputValue(flow),
    feedbackLoop: formatInputValue(feedbackLoop),
    errorHandling: formatInputValue(errorHandling),
    roleHierarchy: hierarchyEntries,
    extras,
  };
}

function serializeCoordinationPolicy(state: CoordinationPolicyState): string {
  const roleHierarchy: Record<string, unknown> = {};

  for (const entry of state.roleHierarchy) {
    const normalizedKey = entry.key.trim();
    if (!normalizedKey) {
      continue;
    }

    roleHierarchy[normalizedKey] = coerceInputValue(entry.value);
  }

  return stringifyJson({
    ...state.extras,
    flow: state.flow.trim(),
    feedbackLoop: state.feedbackLoop.trim(),
    errorHandling: state.errorHandling.trim(),
    roleHierarchy,
  });
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
  const promptConstraints = ensureEditableList(parseStringArray(team?.promptConstraints ?? "[]"));
  const permissionPolicy = parsePermissionPolicy(team?.permissionPolicy ?? "{}");
  const allowedResources = ensureEditableList(permissionPolicy.allowedResources);
  const deniedActions = ensureEditableList(permissionPolicy.deniedActions);
  const successCriteria = ensureEditablePairs(parsePairEntries(team?.successCriteria ?? "{}"));
  const coordinationPolicy = parseCoordinationPolicy(team?.coordinationPolicy ?? "{}");
  const roleHierarchy = ensureEditablePairs(coordinationPolicy.roleHierarchy);

  const updatePromptConstraints = (items: string[]) => {
    onChangeField(
      "promptConstraints",
      stringifyJson(items.map((item) => item.trim()).filter(Boolean)),
    );
  };

  const updatePermissionPolicy = (nextState: PermissionPolicyState) => {
    onChangeField("permissionPolicy", serializePermissionPolicy(nextState));
  };

  const updateSuccessCriteria = (entries: PairEntry[]) => {
    onChangeField("successCriteria", serializePairEntries(entries));
  };

  const updateCoordinationPolicy = (nextState: CoordinationPolicyState) => {
    onChangeField("coordinationPolicy", serializeCoordinationPolicy(nextState));
  };

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
                <div className="team-editor__list">
                  {promptConstraints.map((constraint, index) => (
                    <div className="team-editor__row" key={`constraint-${index}`}>
                      <input
                        aria-label={`Prompt constraint ${index + 1}`}
                        className="team-editor__input"
                        onChange={(event) =>
                          updatePromptConstraints(
                            promptConstraints.map((item, itemIndex) =>
                              itemIndex === index ? event.target.value : item,
                            ),
                          )
                        }
                        type="text"
                        value={constraint}
                      />
                      <button
                        onClick={() =>
                          updatePromptConstraints(
                            promptConstraints.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="team-editor__add-action"
                  onClick={() => updatePromptConstraints([...promptConstraints, ""])}
                  type="button"
                >
                  Add constraint
                </button>
              </div>

              <div className="team-editor__summary-card team-editor__summary-card--editable">
                <span>Permission policy</span>
                <div className="team-editor__stack">
                  <div className="team-editor__subsection">
                    <span>Allowed resources</span>
                    <div className="team-editor__list">
                      {allowedResources.map((resource, index) => (
                        <div className="team-editor__row" key={`resource-${index}`}>
                          <input
                            aria-label={`Allowed resource ${index + 1}`}
                            className="team-editor__input"
                            onChange={(event) =>
                              updatePermissionPolicy({
                                ...permissionPolicy,
                                allowedResources: allowedResources.map((item, itemIndex) =>
                                  itemIndex === index ? event.target.value : item,
                                ),
                              })
                            }
                            type="text"
                            value={resource}
                          />
                          <button
                            onClick={() =>
                              updatePermissionPolicy({
                                ...permissionPolicy,
                                allowedResources: allowedResources.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                              })
                            }
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      className="team-editor__add-action"
                      onClick={() =>
                        updatePermissionPolicy({
                          ...permissionPolicy,
                          allowedResources: [...allowedResources, ""],
                        })
                      }
                      type="button"
                    >
                      Add resource
                    </button>
                  </div>

                  <div className="team-editor__subsection">
                    <span>Denied actions</span>
                    <div className="team-editor__list">
                      {deniedActions.map((action, index) => (
                        <div className="team-editor__row" key={`denied-action-${index}`}>
                          <input
                            aria-label={`Denied action ${index + 1}`}
                            className="team-editor__input"
                            onChange={(event) =>
                              updatePermissionPolicy({
                                ...permissionPolicy,
                                deniedActions: deniedActions.map((item, itemIndex) =>
                                  itemIndex === index ? event.target.value : item,
                                ),
                              })
                            }
                            type="text"
                            value={action}
                          />
                          <button
                            onClick={() =>
                              updatePermissionPolicy({
                                ...permissionPolicy,
                                deniedActions: deniedActions.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                              })
                            }
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      className="team-editor__add-action"
                      onClick={() =>
                        updatePermissionPolicy({
                          ...permissionPolicy,
                          deniedActions: [...deniedActions, ""],
                        })
                      }
                      type="button"
                    >
                      Add action
                    </button>
                  </div>

                  <label className="team-editor__field team-editor__field--compact">
                    <span>Runtime ceiling (minutes)</span>
                    <input
                      aria-label="Permission max execution time minutes"
                      className="team-editor__input"
                      inputMode="numeric"
                      onChange={(event) =>
                        updatePermissionPolicy({
                          ...permissionPolicy,
                          maxExecutionTimeMinutes: event.target.value,
                        })
                      }
                      type="text"
                      value={permissionPolicy.maxExecutionTimeMinutes}
                    />
                  </label>
                </div>
              </div>

              <div className="team-editor__summary-card team-editor__summary-card--editable">
                <span>Success criteria</span>
                <div className="team-editor__list">
                  {successCriteria.map((entry, index) => (
                    <div className="team-editor__row team-editor__row--split" key={`criteria-${index}`}>
                      <input
                        aria-label={`Success criteria key ${index + 1}`}
                        className="team-editor__input"
                        onChange={(event) =>
                          updateSuccessCriteria(
                            successCriteria.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, key: event.target.value } : item,
                            ),
                          )
                        }
                        type="text"
                        value={entry.key}
                      />
                      <input
                        aria-label={`Success criteria value ${index + 1}`}
                        className="team-editor__input"
                        onChange={(event) =>
                          updateSuccessCriteria(
                            successCriteria.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, value: event.target.value } : item,
                            ),
                          )
                        }
                        type="text"
                        value={entry.value}
                      />
                      <button
                        onClick={() =>
                          updateSuccessCriteria(
                            successCriteria.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="team-editor__add-action"
                  onClick={() => updateSuccessCriteria([...successCriteria, { key: "", value: "" }])}
                  type="button"
                >
                  Add criteria
                </button>
              </div>

              <div className="team-editor__summary-card team-editor__summary-card--editable">
                <span>Coordination</span>
                <div className="team-editor__stack">
                  <label className="team-editor__field team-editor__field--compact">
                    <span>Flow</span>
                    <input
                      aria-label="Coordination flow"
                      className="team-editor__input"
                      onChange={(event) =>
                        updateCoordinationPolicy({
                          ...coordinationPolicy,
                          flow: event.target.value,
                        })
                      }
                      type="text"
                      value={coordinationPolicy.flow}
                    />
                  </label>
                  <label className="team-editor__field team-editor__field--compact">
                    <span>Feedback loop</span>
                    <textarea
                      aria-label="Coordination feedback loop"
                      onChange={(event) =>
                        updateCoordinationPolicy({
                          ...coordinationPolicy,
                          feedbackLoop: event.target.value,
                        })
                      }
                      rows={3}
                      value={coordinationPolicy.feedbackLoop}
                    />
                  </label>
                  <label className="team-editor__field team-editor__field--compact">
                    <span>Error handling</span>
                    <textarea
                      aria-label="Coordination error handling"
                      onChange={(event) =>
                        updateCoordinationPolicy({
                          ...coordinationPolicy,
                          errorHandling: event.target.value,
                        })
                      }
                      rows={3}
                      value={coordinationPolicy.errorHandling}
                    />
                  </label>
                  <div className="team-editor__subsection">
                    <span>Role hierarchy</span>
                    <div className="team-editor__list">
                      {roleHierarchy.map((entry, index) => (
                        <div className="team-editor__row team-editor__row--split" key={`role-${index}`}>
                          <input
                            aria-label={`Role hierarchy role ${index + 1}`}
                            className="team-editor__input"
                            onChange={(event) =>
                              updateCoordinationPolicy({
                                ...coordinationPolicy,
                                roleHierarchy: roleHierarchy.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, key: event.target.value } : item,
                                ),
                              })
                            }
                            type="text"
                            value={entry.key}
                          />
                          <input
                            aria-label={`Role hierarchy value ${index + 1}`}
                            className="team-editor__input"
                            onChange={(event) =>
                              updateCoordinationPolicy({
                                ...coordinationPolicy,
                                roleHierarchy: roleHierarchy.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, value: event.target.value } : item,
                                ),
                              })
                            }
                            type="text"
                            value={entry.value}
                          />
                          <button
                            onClick={() =>
                              updateCoordinationPolicy({
                                ...coordinationPolicy,
                                roleHierarchy: roleHierarchy.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                              })
                            }
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      className="team-editor__add-action"
                      onClick={() =>
                        updateCoordinationPolicy({
                          ...coordinationPolicy,
                          roleHierarchy: [...roleHierarchy, { key: "", value: "" }],
                        })
                      }
                      type="button"
                    >
                      Add role
                    </button>
                  </div>
                </div>
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
