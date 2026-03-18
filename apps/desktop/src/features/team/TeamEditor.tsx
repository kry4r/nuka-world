import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AgentRecord } from "@/lib/agents";
import { humanizeGeneratedAgentDescription } from "@/lib/agentPresentation";
import type { TeamRecord } from "@/lib/team";
import { TeamAgentCard } from "./TeamAgentCard";

type TeamEditorProps = {
  availableAgents: AgentRecord[];
  createGoalDraft: string;
  isSaving: boolean;
  isStartingRun: boolean;
  isGeneratingTeam: boolean;
  recentLaunches: Array<{
    id: string;
    summary: string;
    title: string;
    updatedAt: string;
  }>;
  team: TeamRecord | null;
  teamStatusLabel: string;
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
  onCreateGoalDraftChange: (value: string) => void;
  onCreateTeamFromGoal: () => void;
  onOpenLaunchInChat: (sessionId: string) => void;
  onRemoveAssignedAgent: (agentId: string) => void;
  onSave: () => void;
  onStartRun: () => void;
  onToggleTool: (agentId: string, toolId: string, allowed: boolean) => void;
};

type PairEntry = {
  key: string;
  value: string;
};

type PromptConstraintsState = {
  executorAgentsMin: string;
  extras: Record<string, unknown>;
  language: string;
  operationalRules: string[];
  schedulerAgents: string;
  scope: string[];
};

type PermissionPolicyState = {
  allowedResources: string[];
  deniedActions: string[];
  maxExecutionTimeMinutes: string;
  extras: Record<string, unknown>;
};

type CoordinationPolicyState = {
  errorHandling: string;
  extras: Record<string, unknown>;
  feedbackLoop: string;
  flow: string;
  roleHierarchy: PairEntry[];
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

function parsePromptConstraints(value: string): PromptConstraintsState {
  const parsed = parseJsonValue(value);

  if (Array.isArray(parsed)) {
    return {
      executorAgentsMin: "",
      extras: {},
      language: "zh-CN",
      operationalRules: parsed.map((item) => String(item)),
      schedulerAgents: "",
      scope: [],
    };
  }

  const record = isRecord(parsed) ? parsed : {};
  const { language, mustHaveRoles, operationalRules, scope, ...extras } =
    record;
  const roleRecord = isRecord(mustHaveRoles) ? mustHaveRoles : {};

  return {
    executorAgentsMin: formatInputValue(roleRecord.executorAgentsMin),
    extras,
    language: formatInputValue(language) || "zh-CN",
    operationalRules: Array.isArray(operationalRules)
      ? operationalRules.map((item) => String(item))
      : [],
    schedulerAgents: formatInputValue(roleRecord.schedulerAgents),
    scope: Array.isArray(scope) ? scope.map((item) => String(item)) : [],
  };
}

function serializePromptConstraints(state: PromptConstraintsState): string {
  const mustHaveRoles: Record<string, unknown> = {};

  if (state.schedulerAgents.trim()) {
    mustHaveRoles.schedulerAgents = coerceInputValue(state.schedulerAgents);
  }

  if (state.executorAgentsMin.trim()) {
    mustHaveRoles.executorAgentsMin = coerceInputValue(state.executorAgentsMin);
  }

  return stringifyJson({
    ...state.extras,
    language: state.language.trim() || "zh-CN",
    mustHaveRoles,
    operationalRules: state.operationalRules
      .map((item) => item.trim())
      .filter(Boolean),
    scope: state.scope.map((item) => item.trim()).filter(Boolean),
  });
}

function parsePermissionPolicy(value: string): PermissionPolicyState {
  const record = parseJsonRecord(value);
  const {
    allowedResources,
    deniedActions,
    maxExecutionTimeMinutes,
    ...extras
  } = record;

  return {
    allowedResources: Array.isArray(allowedResources)
      ? allowedResources.map((item) => String(item))
      : [],
    deniedActions: Array.isArray(deniedActions)
      ? deniedActions.map((item) => String(item))
      : [],
    maxExecutionTimeMinutes: formatInputValue(maxExecutionTimeMinutes),
    extras,
  };
}

function serializePermissionPolicy(state: PermissionPolicyState): string {
  return stringifyJson({
    ...state.extras,
    allowedResources: state.allowedResources
      .map((item) => item.trim())
      .filter(Boolean),
    deniedActions: state.deniedActions
      .map((item) => item.trim())
      .filter(Boolean),
    maxExecutionTimeMinutes: state.maxExecutionTimeMinutes.trim()
      ? coerceInputValue(state.maxExecutionTimeMinutes)
      : null,
  });
}

function parsePairEntries(value: string): PairEntry[] {
  return Object.entries(parseJsonRecord(value)).map(
    ([entryKey, entryValue]) => ({
      key: entryKey,
      value: formatInputValue(entryValue),
    }),
  );
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
  const { flow, feedbackLoop, errorHandling, roleHierarchy, ...extras } =
    record;
  const hierarchyEntries = isRecord(roleHierarchy)
    ? Object.entries(roleHierarchy).map(([entryKey, entryValue]) => ({
        key: entryKey,
        value: formatInputValue(entryValue),
      }))
    : [];

  return {
    errorHandling: formatInputValue(errorHandling),
    extras,
    feedbackLoop: formatInputValue(feedbackLoop),
    flow: formatInputValue(flow),
    roleHierarchy: hierarchyEntries,
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
    errorHandling: state.errorHandling.trim(),
    feedbackLoop: state.feedbackLoop.trim(),
    flow: state.flow.trim(),
    roleHierarchy,
  });
}

function updateListItem(items: string[], index: number, value: string) {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}

export function TeamEditor({
  availableAgents,
  createGoalDraft,
  isSaving,
  isStartingRun,
  isGeneratingTeam,
  recentLaunches,
  team,
  teamStatusLabel,
  onAddAssignedAgent,
  onChangeField,
  onCreateGoalDraftChange,
  onCreateTeamFromGoal,
  onOpenLaunchInChat,
  onRemoveAssignedAgent,
  onSave,
  onStartRun,
  onToggleTool,
}: TeamEditorProps) {
  const assignedAgentIds = new Set(
    team?.agentAssignments.map((assignment) => assignment.agentId) ?? [],
  );
  const unassignedAgents = availableAgents.filter(
    (agent) => !assignedAgentIds.has(agent.id),
  );
  const promptConstraints = parsePromptConstraints(
    team?.promptConstraints ?? "{}",
  );
  const operationalRules = ensureEditableList(
    promptConstraints.operationalRules,
  );
  const scopeItems = ensureEditableList(promptConstraints.scope);
  const permissionPolicy = parsePermissionPolicy(
    team?.permissionPolicy ?? "{}",
  );
  const allowedResources = ensureEditableList(
    permissionPolicy.allowedResources,
  );
  const deniedActions = ensureEditableList(permissionPolicy.deniedActions);
  const successCriteria = ensureEditablePairs(
    parsePairEntries(team?.successCriteria ?? "{}"),
  );
  const coordinationPolicy = parseCoordinationPolicy(
    team?.coordinationPolicy ?? "{}",
  );
  const roleHierarchy = ensureEditablePairs(coordinationPolicy.roleHierarchy);

  const updatePromptConstraints = (nextState: PromptConstraintsState) => {
    onChangeField("promptConstraints", serializePromptConstraints(nextState));
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
                <StatusBadge tone="accent">{teamStatusLabel}</StatusBadge>
                <StatusBadge tone="soft">
                  {team.agentAssignments.length} 个已分配
                </StatusBadge>
              </div>
              <h2>{team.name}</h2>
              <label className="team-editor__field">
                <span>协作团队说明</span>
                <textarea
                  aria-label="协作团队说明"
                  onChange={(event) =>
                    onChangeField("summary", event.target.value)
                  }
                  rows={4}
                  value={team.summary}
                />
              </label>
            </div>

            <div className="team-editor__summary-grid">
              <div className="team-editor__summary-card team-editor__summary-card--editable">
                <span>协作约束</span>
                <div className="team-editor__stack">
                  <label className="team-editor__field team-editor__field--compact">
                    <span>工作语言</span>
                    <input
                      aria-label="工作语言"
                      className="team-editor__input"
                      onChange={(event) =>
                        updatePromptConstraints({
                          ...promptConstraints,
                          language: event.target.value,
                        })
                      }
                      type="text"
                      value={promptConstraints.language}
                    />
                  </label>

                  <div className="team-editor__row team-editor__row--split">
                    <label className="team-editor__field team-editor__field--compact">
                      <span>调度智能体数量</span>
                      <input
                        aria-label="调度智能体数量"
                        className="team-editor__input"
                        inputMode="numeric"
                        onChange={(event) =>
                          updatePromptConstraints({
                            ...promptConstraints,
                            schedulerAgents: event.target.value,
                          })
                        }
                        type="text"
                        value={promptConstraints.schedulerAgents}
                      />
                    </label>

                    <label className="team-editor__field team-editor__field--compact">
                      <span>执行智能体最少数量</span>
                      <input
                        aria-label="执行智能体最少数量"
                        className="team-editor__input"
                        inputMode="numeric"
                        onChange={(event) =>
                          updatePromptConstraints({
                            ...promptConstraints,
                            executorAgentsMin: event.target.value,
                          })
                        }
                        type="text"
                        value={promptConstraints.executorAgentsMin}
                      />
                    </label>
                  </div>

                  <div className="team-editor__subsection">
                    <span>工作规则</span>
                    <div className="team-editor__list">
                      {operationalRules.map((rule, index) => (
                        <div className="team-editor__row" key={`rule-${index}`}>
                          <input
                            aria-label={`工作规则 ${index + 1}`}
                            className="team-editor__input"
                            onChange={(event) =>
                              updatePromptConstraints({
                                ...promptConstraints,
                                operationalRules: updateListItem(
                                  operationalRules,
                                  index,
                                  event.target.value,
                                ),
                              })
                            }
                            type="text"
                            value={rule}
                          />
                          <button
                            onClick={() =>
                              updatePromptConstraints({
                                ...promptConstraints,
                                operationalRules: operationalRules.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                              })
                            }
                            type="button"
                          >
                            移除
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      className="team-editor__add-action"
                      onClick={() =>
                        updatePromptConstraints({
                          ...promptConstraints,
                          operationalRules: [...operationalRules, ""],
                        })
                      }
                      type="button"
                    >
                      添加规则
                    </button>
                  </div>

                  <div className="team-editor__subsection">
                    <span>覆盖范围</span>
                    <div className="team-editor__list">
                      {scopeItems.map((scope, index) => (
                        <div
                          className="team-editor__row"
                          key={`scope-${index}`}
                        >
                          <input
                            aria-label={`覆盖范围 ${index + 1}`}
                            className="team-editor__input"
                            onChange={(event) =>
                              updatePromptConstraints({
                                ...promptConstraints,
                                scope: updateListItem(
                                  scopeItems,
                                  index,
                                  event.target.value,
                                ),
                              })
                            }
                            type="text"
                            value={scope}
                          />
                          <button
                            onClick={() =>
                              updatePromptConstraints({
                                ...promptConstraints,
                                scope: scopeItems.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                              })
                            }
                            type="button"
                          >
                            移除
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      className="team-editor__add-action"
                      onClick={() =>
                        updatePromptConstraints({
                          ...promptConstraints,
                          scope: [...scopeItems, ""],
                        })
                      }
                      type="button"
                    >
                      添加范围
                    </button>
                  </div>
                </div>
              </div>

              <div className="team-editor__summary-card team-editor__summary-card--editable">
                <span>权限策略</span>
                <div className="team-editor__stack">
                  <div className="team-editor__subsection">
                    <span>允许访问的资源</span>
                    <div className="team-editor__list">
                      {allowedResources.map((resource, index) => (
                        <div
                          className="team-editor__row"
                          key={`resource-${index}`}
                        >
                          <input
                            aria-label={`允许访问的资源 ${index + 1}`}
                            className="team-editor__input"
                            onChange={(event) =>
                              updatePermissionPolicy({
                                ...permissionPolicy,
                                allowedResources: updateListItem(
                                  allowedResources,
                                  index,
                                  event.target.value,
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
                            移除
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
                      添加资源
                    </button>
                  </div>

                  <div className="team-editor__subsection">
                    <span>禁止动作</span>
                    <div className="team-editor__list">
                      {deniedActions.map((action, index) => (
                        <div
                          className="team-editor__row"
                          key={`denied-action-${index}`}
                        >
                          <input
                            aria-label={`禁止动作 ${index + 1}`}
                            className="team-editor__input"
                            onChange={(event) =>
                              updatePermissionPolicy({
                                ...permissionPolicy,
                                deniedActions: updateListItem(
                                  deniedActions,
                                  index,
                                  event.target.value,
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
                            移除
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
                      添加动作
                    </button>
                  </div>

                  <label className="team-editor__field team-editor__field--compact">
                    <span>运行时长上限（分钟）</span>
                    <input
                      aria-label="运行时长上限（分钟）"
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
                <span>成功标准</span>
                <div className="team-editor__list">
                  {successCriteria.map((entry, index) => (
                    <div
                      className="team-editor__row team-editor__row--split"
                      key={`criteria-${index}`}
                    >
                      <input
                        aria-label={`成功标准名称 ${index + 1}`}
                        className="team-editor__input"
                        onChange={(event) =>
                          updateSuccessCriteria(
                            successCriteria.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, key: event.target.value }
                                : item,
                            ),
                          )
                        }
                        type="text"
                        value={entry.key}
                      />
                      <input
                        aria-label={`成功标准内容 ${index + 1}`}
                        className="team-editor__input"
                        onChange={(event) =>
                          updateSuccessCriteria(
                            successCriteria.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, value: event.target.value }
                                : item,
                            ),
                          )
                        }
                        type="text"
                        value={entry.value}
                      />
                      <button
                        onClick={() =>
                          updateSuccessCriteria(
                            successCriteria.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                        type="button"
                      >
                        移除
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="team-editor__add-action"
                  onClick={() =>
                    updateSuccessCriteria([
                      ...successCriteria,
                      { key: "", value: "" },
                    ])
                  }
                  type="button"
                >
                  添加标准
                </button>
              </div>

              <div className="team-editor__summary-card team-editor__summary-card--editable">
                <span>协作方式</span>
                <div className="team-editor__stack">
                  <label className="team-editor__field team-editor__field--compact">
                    <span>流程</span>
                    <input
                      aria-label="流程"
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
                    <span>反馈回路</span>
                    <textarea
                      aria-label="反馈回路"
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
                    <span>异常处理</span>
                    <textarea
                      aria-label="异常处理"
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
                    <span>角色层级</span>
                    <div className="team-editor__list">
                      {roleHierarchy.map((entry, index) => (
                        <div
                          className="team-editor__row team-editor__row--split"
                          key={`role-${index}`}
                        >
                          <input
                            aria-label={`角色层级名称 ${index + 1}`}
                            className="team-editor__input"
                            onChange={(event) =>
                              updateCoordinationPolicy({
                                ...coordinationPolicy,
                                roleHierarchy: roleHierarchy.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, key: event.target.value }
                                      : item,
                                ),
                              })
                            }
                            type="text"
                            value={entry.key}
                          />
                          <input
                            aria-label={`角色层级内容 ${index + 1}`}
                            className="team-editor__input"
                            onChange={(event) =>
                              updateCoordinationPolicy({
                                ...coordinationPolicy,
                                roleHierarchy: roleHierarchy.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, value: event.target.value }
                                      : item,
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
                            移除
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      className="team-editor__add-action"
                      onClick={() =>
                        updateCoordinationPolicy({
                          ...coordinationPolicy,
                          roleHierarchy: [
                            ...roleHierarchy,
                            { key: "", value: "" },
                          ],
                        })
                      }
                      type="button"
                    >
                      添加角色
                    </button>
                  </div>
                </div>
              </div>

              <div className="team-editor__summary-card team-editor__summary-card--editable team-editor__summary-card--wide">
                <span>最近启动</span>
                {recentLaunches.length === 0 ? (
                  <p>这个协作团队还没有最近运行记录。</p>
                ) : (
                  <div className="team-editor__recent-launches">
                    {recentLaunches.map((launch) => (
                      <div
                        className="team-editor__recent-launch"
                        key={launch.id}
                      >
                        <div className="team-editor__recent-launch-copy">
                          <strong>{launch.title}</strong>
                          <span>{launch.summary}</span>
                        </div>
                        <button
                          onClick={() => onOpenLaunchInChat(launch.id)}
                          type="button"
                        >
                          在对话中打开
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="team-editor__assignments">
            <div className="team-editor__assignment-list">
              <h3>已加入模板的智能体</h3>
              {team.agentAssignments.map((assignment, index) => {
                const agent = team.agents[index];
                const label = agent?.name ?? assignment.agentId;

                return (
                  <div
                    className="team-editor__assignment-row"
                    key={assignment.id}
                  >
                    <div className="team-editor__assignment-copy">
                      <strong>{label}</strong>
                      <span>
                        {agent
                          ? humanizeGeneratedAgentDescription(
                              agent.responsibility,
                            )
                          : "已加入当前协作团队模板。"}
                      </span>
                    </div>
                    <button
                      aria-label={`移除 ${label}`}
                      onClick={() => onRemoveAssignedAgent(assignment.agentId)}
                      type="button"
                    >
                      移除 {label}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="team-editor__assignment-list">
              <h3>可加入的智能体</h3>
              {unassignedAgents.length === 0 ? (
                <div className="team-editor__assignment-empty">
                  当前已把全部已保存智能体加入模板。
                </div>
              ) : (
                unassignedAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => onAddAssignedAgent(agent.id)}
                    type="button"
                  >
                    加入 {agent.name}
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
              {isSaving ? "保存中..." : "保存模板"}
            </button>
            <button
              className="settings-button settings-button--accent"
              disabled={isStartingRun}
              onClick={onStartRun}
              type="button"
            >
              {isStartingRun ? "正在启动..." : "在对话中启动"}
            </button>
          </div>
        </div>
      ) : (
        <div
          className="team-editor__empty team-editor__empty--centered"
          data-testid="team-editor-empty"
        >
          <div className="team-editor__summary team-editor__empty-shell">
            <div className="team-editor__empty-copy">
              <h2>先用一句话生成协作团队</h2>
              <p>
                描述你的目标，我们会先生成一个协作团队模板。生成后你仍然可以在这里继续微调字段、分工和工具权限。
              </p>
            </div>

            <label className="team-editor__field">
              <span>协作团队目标</span>
              <textarea
                aria-label="协作团队目标"
                onChange={(event) => onCreateGoalDraftChange(event.target.value)}
                placeholder="例如：做一个桌面 P0 验收协作团队，至少 5 个子智能体，分别负责 UI、team run、memory、文件时间线和恢复验证。"
                value={createGoalDraft}
              />
            </label>

            <div className="team-editor__actions">
              <button
                className="settings-button settings-button--accent"
                disabled={isGeneratingTeam || !createGoalDraft.trim()}
                onClick={onCreateTeamFromGoal}
                type="button"
              >
                {isGeneratingTeam ? "生成中..." : "一句话生成协作团队"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
