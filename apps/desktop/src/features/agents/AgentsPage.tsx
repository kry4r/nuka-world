import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useProviderGate } from "@/hooks/useProviderGate";
import { useI18n } from "@/lib/i18n";
import {
  humanizeArchetype,
  humanizeGeneratedAgentDescription,
  humanizeGeneratedAgentSystemPrompt,
} from "@/lib/agentPresentation";
import {
  deleteAgent,
  generateAgentDraft,
  listAgents,
  saveAgent,
  type AgentArchetypeRecord,
  type AgentRecord,
} from "@/lib/agents";
import { ToolBindingsPanel } from "./ToolBindingsPanel";

const DEFAULT_REQUEST =
  "Create an agent that researches release notes and writes short weekly digests.";
const DEFAULT_REQUEST_ZH = "生成一个能研究发布说明并撰写简短周报的智能体。";

const AGENTS_COPY = {
  "en-US": {
    addProvider: "Open Settings",
    allowedTools: "Allowed tools",
    archetypeFamily: "Archetype family",
    archetypeTitle: "Archetype title",
    create: "Create",
    creating: "Creating...",
    createTitle: "Generate an agent",
    delete: "Delete Agent",
    description: "Description",
    draft: "Draft",
    errorAction: "Agent Action Error",
    errorDraft: "Agent Draft Error",
    errorGeneric: "Agent Error",
    errorLoad: "Agent Load Error",
    errorSave: "Agent Save Error",
    name: "Name",
    noProvider: "No provider",
    providerAttached: "Provider attached",
    providerLabel: "Provider",
    providerPending: "Provider pending",
    request: "Request",
    requestAria: "Agent request",
    saveAgent: "Save Agent",
    saveChanges: "Save Changes",
    saved: "Saved",
    savedAgents: "Saved agents",
    section: "Agents",
    systemPrompt: "System Prompt",
  },
  "zh-CN": {
    addProvider: "打开设置",
    allowedTools: "允许工具",
    archetypeFamily: "原型家族",
    archetypeTitle: "原型标题",
    create: "生成",
    creating: "生成中...",
    createTitle: "生成智能体",
    delete: "删除智能体",
    description: "描述",
    draft: "草稿",
    errorAction: "智能体操作失败",
    errorDraft: "智能体草稿生成失败",
    errorGeneric: "智能体异常",
    errorLoad: "智能体加载失败",
    errorSave: "智能体保存失败",
    name: "名称",
    noProvider: "未绑定提供方",
    providerAttached: "已绑定提供方",
    providerLabel: "提供方",
    providerPending: "待绑定提供方",
    request: "需求",
    requestAria: "智能体需求",
    saveAgent: "保存智能体",
    saveChanges: "保存变更",
    saved: "已保存",
    savedAgents: "已保存智能体",
    section: "智能体",
    systemPrompt: "系统提示词",
  },
} as const;

const ARCHETYPE_FIELD_DEFINITIONS: Array<keyof AgentArchetypeRecord> = [
  "domainFocus",
  "objectivePattern",
  "communicationStyle",
  "defaultToolPosture",
  "memoryPosture",
  "escalationPosture",
  "safetyPosture",
  "outputContract",
];

const ARCHETYPE_FIELD_LABELS: Record<
  keyof AgentArchetypeRecord,
  { "en-US": string; "zh-CN": string }
> = {
  communicationStyle: {
    "en-US": "Communication style",
    "zh-CN": "沟通风格",
  },
  defaultToolPosture: {
    "en-US": "Default tool posture",
    "zh-CN": "默认工具策略",
  },
  domainFocus: {
    "en-US": "Domain focus",
    "zh-CN": "关注领域",
  },
  escalationPosture: {
    "en-US": "Escalation posture",
    "zh-CN": "升级策略",
  },
  family: {
    "en-US": "Archetype family",
    "zh-CN": "原型家族",
  },
  id: {
    "en-US": "Archetype id",
    "zh-CN": "原型 ID",
  },
  memoryPosture: {
    "en-US": "Memory posture",
    "zh-CN": "记忆策略",
  },
  objectivePattern: {
    "en-US": "Objective pattern",
    "zh-CN": "目标模式",
  },
  outputContract: {
    "en-US": "Output contract",
    "zh-CN": "输出约定",
  },
  safetyPosture: {
    "en-US": "Safety posture",
    "zh-CN": "安全策略",
  },
  title: {
    "en-US": "Archetype title",
    "zh-CN": "原型标题",
  },
};

function defaultArchetype(): AgentArchetypeRecord {
  return {
    id: "archetype-general",
    title: "General Operator",
    family: "general",
    domainFocus: "General execution",
    objectivePattern: "Understand the goal and move it forward",
    communicationStyle: "Clear and pragmatic",
    defaultToolPosture: "Use the least-cost tool that can finish the work",
    memoryPosture: "Retain durable context and drop transient chatter",
    escalationPosture: "Escalate when blocked or when risk rises",
    safetyPosture: "Avoid unsupported or destructive actions",
    outputContract: "Return a concise actionable result",
  };
}

function cloneAgent(agent: AgentRecord): AgentRecord {
  return {
    ...agent,
    archetype: { ...(agent.archetype ?? defaultArchetype()) },
    toolNames: [...agent.toolNames],
  };
}

function parseToolNames(value: string) {
  return value
    .split(",")
    .map((toolName) => toolName.trim())
    .filter(Boolean);
}

function localizeAgentForLocale(agent: AgentRecord, locale: "en-US" | "zh-CN") {
  const cloned = cloneAgent(agent);

  if (locale !== "zh-CN") {
    return cloned;
  }

  return {
    ...cloned,
    archetype: humanizeArchetype(cloned.archetype ?? defaultArchetype()),
    description: humanizeGeneratedAgentDescription(cloned.description),
    systemPrompt: humanizeGeneratedAgentSystemPrompt(
      cloned.systemPrompt,
      cloned.name,
    ),
  };
}

export function AgentsPage() {
  const { locale } = useI18n();
  const copy = AGENTS_COPY[locale];
  const providerGate = useProviderGate();
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [draftAgent, setDraftAgent] = useState<AgentRecord | null>(null);
  const [editorAgent, setEditorAgent] = useState<AgentRecord | null>(null);
  const [request, setRequest] = useState(
    locale === "zh-CN" ? DEFAULT_REQUEST_ZH : DEFAULT_REQUEST,
  );
  const [toolNamesInput, setToolNamesInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRequest((current) => {
      if (current === DEFAULT_REQUEST || current === DEFAULT_REQUEST_ZH) {
        return locale === "zh-CN" ? DEFAULT_REQUEST_ZH : DEFAULT_REQUEST;
      }

      return current;
    });
  }, [locale]);

  useEffect(() => {
    let alive = true;

    void listAgents()
      .then((savedAgents) => {
        if (!alive) {
          return;
        }

        setAgents(savedAgents);
        setSelectedAgentId(savedAgents[0]?.id ?? null);
      })
      .catch((caughtError) => {
        if (!alive) {
          return;
        }

        const message =
          caughtError instanceof Error
            ? caughtError.message
            : String(caughtError);
        setErrorTitle(copy.errorLoad);
        setError(message);
      });

    return () => {
      alive = false;
    };
  }, []);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );
  const detailAgent = draftAgent ?? selectedAgent;
  const localizedDetailAgent = useMemo(
    () => (detailAgent ? localizeAgentForLocale(detailAgent, locale) : null),
    [detailAgent, locale],
  );
  const showStandaloneCreate = agents.length === 0 && !detailAgent;

  useEffect(() => {
    if (!localizedDetailAgent) {
      setEditorAgent(null);
      setToolNamesInput("");
      return;
    }

    setEditorAgent(localizedDetailAgent);
    setToolNamesInput(localizedDetailAgent.toolNames.join(", "));
  }, [localizedDetailAgent]);

  const handleGenerateDraft = async () => {
    if (!request.trim() || !providerGate.ready) {
      return;
    }

    setErrorTitle(null);
    setError(null);
    setIsGenerating(true);

    try {
      const draft = await generateAgentDraft(request);
      setDraftAgent(draft);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
      setErrorTitle(copy.errorDraft);
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveEditor = async () => {
    if (!editorAgent) {
      return;
    }

    setErrorTitle(null);
    setError(null);

    try {
      const payload = {
        ...editorAgent,
        archetype: editorAgent.archetype ?? defaultArchetype(),
        toolNames: parseToolNames(toolNamesInput),
      };
      const saved = await saveAgent(payload);

      setAgents((current) => {
        const existingIndex = current.findIndex(
          (agent) => agent.id === saved.id,
        );
        if (existingIndex === -1) {
          return [...current, saved];
        }

        const nextAgents = [...current];
        nextAgents[existingIndex] = saved;
        return nextAgents;
      });
      setSelectedAgentId(saved.id);
      setDraftAgent(null);
      setEditorAgent(cloneAgent(saved));
      setToolNamesInput(saved.toolNames.join(", "));
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
      setErrorTitle(draftAgent ? copy.errorDraft : copy.errorSave);
      setError(message);
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedAgent) {
      return;
    }

    setErrorTitle(null);
    setError(null);

    try {
      await deleteAgent(selectedAgent.id);
      const nextAgents = agents.filter(
        (agent) => agent.id !== selectedAgent.id,
      );
      setAgents(nextAgents);
      setSelectedAgentId(nextAgents[0]?.id ?? null);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
      setErrorTitle(copy.errorAction);
      setError(message);
    }
  };

  const detailTone = draftAgent ? "warning" : "accent";
  const editorArchetype = editorAgent?.archetype ?? defaultArchetype();

  return (
    <div className="page-layout agents-page">
      <div
        className={`page-layout__body agents-page__body${showStandaloneCreate ? " agents-page__body--empty" : ""}`}
      >
        {agents.length > 0 ? (
          <aside
            aria-label={copy.savedAgents}
            className="agents-list"
            data-testid="agents-list"
          >
            <div className="agents-list__header">
              <span className="agents-section__eyebrow">{copy.section}</span>
              <h2>{copy.saved}</h2>
            </div>

            {agents.map((agent) => {
              const isActive = agent.id === selectedAgentId && !draftAgent;

              return (
                <button
                  aria-pressed={isActive}
                  className={`agents-list__item${isActive ? " is-active" : ""}`}
                  key={agent.id}
                  onClick={() => {
                    setSelectedAgentId(agent.id);
                    setDraftAgent(null);
                  }}
                  type="button"
                >
                  <span className="agents-list__title">{agent.name}</span>
                  <span className="agents-list__summary">
                    {locale === "zh-CN"
                      ? humanizeGeneratedAgentDescription(agent.description)
                      : agent.description}
                  </span>
                </button>
              );
            })}
          </aside>
        ) : null}

        <div className="agents-page__main agents-page__main--scrollable">
          <section
            className={`agents-create${showStandaloneCreate ? " agents-create--standalone" : ""}`}
            data-testid="agents-create"
          >
            <div className="agents-create__header">
              <span className="agents-section__eyebrow">{copy.section}</span>
              <h1>{copy.createTitle}</h1>
            </div>

            {providerGate.blocked ? (
              <div className="agents-inline-note">
                <span>{providerGate.message}</span>
                <button
                  className="settings-button settings-button--accent"
                  onClick={providerGate.openSettings}
                  type="button"
                >
                  {copy.addProvider}
                </button>
              </div>
            ) : null}

            <div className="agents-create__form">
              <label className="agents-field">
                <span className="agents-field__label">{copy.request}</span>
                <input
                  aria-label={copy.requestAria}
                  className="field-input"
                  onChange={(event) => setRequest(event.target.value)}
                  value={request}
                />
              </label>
              <button
                className="composer__send"
                disabled={!providerGate.ready || isGenerating}
                onClick={() => void handleGenerateDraft()}
                type="button"
              >
                {isGenerating ? copy.creating : copy.create}
              </button>
            </div>
          </section>

          {error ? (
            <div className="agents-inline-error">
              <strong>{errorTitle ?? copy.errorGeneric}</strong>
              <span>{error}</span>
            </div>
          ) : null}

          {editorAgent ? (
            <section className="agents-detail" data-testid="agents-detail">
              <div className="agents-detail__header">
                <div className="agents-detail__copy">
                  <div className="agents-detail__badges">
                    <StatusBadge tone={detailTone}>
                      {draftAgent ? copy.draft : copy.saved}
                    </StatusBadge>
                    <StatusBadge tone="soft">
                      {editorAgent.providerId
                        ? copy.providerAttached
                        : copy.providerPending}
                    </StatusBadge>
                  </div>
                  <h2>{editorAgent.name}</h2>
                  <p>{editorAgent.description}</p>
                  <p>{editorArchetype.title}</p>
                  <p>{editorArchetype.family}</p>
                </div>
                <div className="agents-detail__actions">
                  <button
                    className="settings-button settings-button--accent"
                    onClick={() => void handleSaveEditor()}
                    type="button"
                  >
                    {draftAgent ? copy.saveAgent : copy.saveChanges}
                  </button>
                  {selectedAgent && !draftAgent ? (
                    <button
                      className="settings-button settings-button--danger"
                      onClick={() => void handleDeleteSelected()}
                      type="button"
                    >
                      {copy.delete}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="agents-detail__grid">
                <label className="agents-field">
                  <span className="agents-field__label">{copy.name}</span>
                  <input
                    className="field-input"
                    onChange={(event) =>
                      setEditorAgent((current) =>
                        current
                          ? {
                              ...current,
                              name: event.target.value,
                            }
                          : current,
                      )
                    }
                    value={editorAgent.name}
                  />
                </label>

                <label className="agents-field">
                  <span className="agents-field__label">
                    {copy.description}
                  </span>
                  <input
                    className="field-input"
                    onChange={(event) =>
                      setEditorAgent((current) =>
                        current
                          ? {
                              ...current,
                              description: event.target.value,
                            }
                          : current,
                      )
                    }
                    value={editorAgent.description}
                  />
                </label>

                <label className="agents-field agents-field--full">
                  <span className="agents-field__label">
                    {copy.systemPrompt}
                  </span>
                  <textarea
                    className="agents-field__textarea"
                    onChange={(event) =>
                      setEditorAgent((current) =>
                        current
                          ? {
                              ...current,
                              systemPrompt: event.target.value,
                            }
                          : current,
                      )
                    }
                    value={editorAgent.systemPrompt}
                  />
                </label>

                <div className="agents-field">
                  <span className="agents-field__label">
                    {copy.providerLabel}
                  </span>
                  <div className="agents-readonly">
                    {copy.providerLabel}:{" "}
                    {editorAgent.providerId ?? copy.noProvider}
                  </div>
                </div>

                <label className="agents-field">
                  <span className="agents-field__label">
                    {copy.archetypeTitle}
                  </span>
                  <input
                    aria-label={copy.archetypeTitle}
                    className="field-input"
                    onChange={(event) =>
                      setEditorAgent((current) =>
                        current
                          ? {
                              ...current,
                              archetype: {
                                ...(current.archetype ?? defaultArchetype()),
                                title: event.target.value,
                              },
                            }
                          : current,
                      )
                    }
                    value={editorArchetype.title}
                  />
                </label>

                <label className="agents-field">
                  <span className="agents-field__label">
                    {copy.archetypeFamily}
                  </span>
                  <input
                    aria-label={copy.archetypeFamily}
                    className="field-input"
                    onChange={(event) =>
                      setEditorAgent((current) =>
                        current
                          ? {
                              ...current,
                              archetype: {
                                ...(current.archetype ?? defaultArchetype()),
                                family: event.target.value,
                              },
                            }
                          : current,
                      )
                    }
                    value={editorArchetype.family}
                  />
                </label>

                {ARCHETYPE_FIELD_DEFINITIONS.map((fieldKey) => {
                  const fieldLabel = ARCHETYPE_FIELD_LABELS[fieldKey][locale];
                  const fieldAriaLabel =
                    locale === "zh-CN"
                      ? fieldLabel
                      : `Archetype ${fieldLabel.toLowerCase()}`;

                  return (
                    <label className="agents-field" key={fieldKey}>
                      <span className="agents-field__label">{fieldLabel}</span>
                      <textarea
                        aria-label={fieldAriaLabel}
                        className="agents-field__textarea agents-field__textarea--compact"
                        onChange={(event) =>
                          setEditorAgent((current) =>
                            current
                              ? {
                                  ...current,
                                  archetype: {
                                    ...(current.archetype ??
                                      defaultArchetype()),
                                    [fieldKey]: event.target.value,
                                  },
                                }
                              : current,
                          )
                        }
                        rows={3}
                        value={editorArchetype[fieldKey]}
                      />
                    </label>
                  );
                })}

                <ToolBindingsPanel
                  inputValue={toolNamesInput}
                  onInputValueChange={(value) => {
                    setToolNamesInput(value);
                    setEditorAgent((current) =>
                      current
                        ? {
                            ...current,
                            toolNames: parseToolNames(value),
                          }
                        : current,
                    );
                  }}
                  title={copy.allowedTools}
                  toolNames={editorAgent.toolNames}
                />
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
