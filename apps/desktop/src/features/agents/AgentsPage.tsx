import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useProviderGate } from "@/hooks/useProviderGate";
import {
  deleteAgent,
  generateAgentDraft,
  listAgents,
  saveAgent,
  type AgentRecord,
} from "@/lib/agents";
import { ToolBindingsPanel } from "./ToolBindingsPanel";

const DEFAULT_REQUEST = "Create an agent that researches release notes and writes short weekly digests.";

function cloneAgent(agent: AgentRecord): AgentRecord {
  return {
    ...agent,
    toolNames: [...agent.toolNames],
  };
}

function parseToolNames(value: string) {
  return value
    .split(",")
    .map((toolName) => toolName.trim())
    .filter(Boolean);
}

export function AgentsPage() {
  const providerGate = useProviderGate();
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [draftAgent, setDraftAgent] = useState<AgentRecord | null>(null);
  const [editorAgent, setEditorAgent] = useState<AgentRecord | null>(null);
  const [request, setRequest] = useState(DEFAULT_REQUEST);
  const [toolNamesInput, setToolNamesInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

        const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
        setErrorTitle("Agent Load Error");
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
  const showStandaloneCreate = agents.length === 0 && !detailAgent;

  useEffect(() => {
    if (!detailAgent) {
      setEditorAgent(null);
      setToolNamesInput("");
      return;
    }

    setEditorAgent(cloneAgent(detailAgent));
    setToolNamesInput(detailAgent.toolNames.join(", "));
  }, [detailAgent]);

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
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setErrorTitle("Agent Draft Error");
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
        toolNames: parseToolNames(toolNamesInput),
      };
      const saved = await saveAgent(payload);

      setAgents((current) => {
        const existingIndex = current.findIndex((agent) => agent.id === saved.id);
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
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setErrorTitle(draftAgent ? "Agent Draft Error" : "Agent Save Error");
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
      const nextAgents = agents.filter((agent) => agent.id !== selectedAgent.id);
      setAgents(nextAgents);
      setSelectedAgentId(nextAgents[0]?.id ?? null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setErrorTitle("Agent Action Error");
      setError(message);
    }
  };

  const detailTone = draftAgent ? "warning" : "accent";

  return (
    <div className="page-layout agents-page">
      <div
        className={`page-layout__body agents-page__body${showStandaloneCreate ? " agents-page__body--empty" : ""}`}
      >
        {agents.length > 0 ? (
          <aside aria-label="Saved agents" className="agents-list" data-testid="agents-list">
            <div className="agents-list__header">
              <span className="agents-section__eyebrow">Agents</span>
              <h2>Saved</h2>
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
                  <span className="agents-list__summary">{agent.description}</span>
                </button>
              );
            })}
          </aside>
        ) : null}

        <div className="agents-page__main">
          <section className={`agents-create${showStandaloneCreate ? " agents-create--standalone" : ""}`} data-testid="agents-create">
            <div className="agents-create__header">
              <span className="agents-section__eyebrow">Agents</span>
              <h1>Generate an agent</h1>
              <p>Describe the role in one sentence, then refine the draft before saving it.</p>
            </div>

            {providerGate.blocked ? (
              <div className="agents-inline-note">
                <span>{providerGate.message}</span>
                <button
                  className="settings-button settings-button--accent"
                  onClick={providerGate.openSettings}
                  type="button"
                >
                  Open Settings
                </button>
              </div>
            ) : null}

            <div className="agents-create__form">
              <label className="agents-field">
                <span className="agents-field__label">Request</span>
                <input
                  aria-label="Agent request"
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
                {isGenerating ? "Creating..." : "Create"}
              </button>
            </div>
          </section>

          {error ? (
            <div className="agents-inline-error">
              <strong>{errorTitle ?? "Agent Error"}</strong>
              <span>{error}</span>
            </div>
          ) : null}

          {editorAgent ? (
            <section className="agents-detail" data-testid="agents-detail">
              <div className="agents-detail__header">
                <div className="agents-detail__copy">
                  <div className="agents-detail__badges">
                    <StatusBadge tone={detailTone}>{draftAgent ? "Draft" : "Saved"}</StatusBadge>
                    <StatusBadge tone="soft">
                      {editorAgent.providerId ? "Provider attached" : "Provider pending"}
                    </StatusBadge>
                  </div>
                  <h2>{editorAgent.name}</h2>
                  <p>{editorAgent.description}</p>
                </div>
                <div className="agents-detail__actions">
                  <button
                    className="settings-button settings-button--accent"
                    onClick={() => void handleSaveEditor()}
                    type="button"
                  >
                    {draftAgent ? "Save Agent" : "Save Changes"}
                  </button>
                  {selectedAgent && !draftAgent ? (
                    <button
                      className="settings-button settings-button--danger"
                      onClick={() => void handleDeleteSelected()}
                      type="button"
                    >
                      Delete Agent
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="agents-detail__grid">
                <label className="agents-field">
                  <span className="agents-field__label">Name</span>
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
                  <span className="agents-field__label">Description</span>
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
                  <span className="agents-field__label">System Prompt</span>
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
                  <span className="agents-field__label">Provider</span>
                  <div className="agents-readonly">Provider: {editorAgent.providerId ?? "No provider"}</div>
                </div>

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
                  title="Allowed tools"
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
