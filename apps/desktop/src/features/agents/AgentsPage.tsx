import { useEffect, useMemo, useState } from "react";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  deleteAgent,
  generateAgentDraft,
  listAgents,
  saveAgent,
  type AgentRecord,
} from "@/lib/agents";
import { ToolBindingsPanel } from "./ToolBindingsPanel";

const DEFAULT_REQUEST = "Create an agent that researches release notes and writes short weekly digests.";

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [draftAgent, setDraftAgent] = useState<AgentRecord | null>(null);
  const [request, setRequest] = useState(DEFAULT_REQUEST);
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

  const handleGenerateDraft = async () => {
    if (!request.trim()) {
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

  const handleSaveDraft = async () => {
    if (!draftAgent) {
      return;
    }

    setErrorTitle(null);
    setError(null);

    try {
      const saved = await saveAgent(draftAgent);
      setAgents((current) => [...current, saved]);
      setSelectedAgentId(saved.id);
      setDraftAgent(null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setErrorTitle("Agent Draft Error");
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
      setAgents((current) => current.filter((agent) => agent.id !== selectedAgent.id));
      setSelectedAgentId(null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setErrorTitle("Agent Action Error");
      setError(message);
    }
  };

  return (
    <div className="page-layout agents-page">
      <SectionHeader
        meta="Quick-create, presets, and tool access"
        status="Create Flow"
        tag="Agents"
        title="Agents"
      />

      <div className="page-layout__body">
        <div
          className="page-layout__main"
          style={{ display: "grid", gap: "1rem", gridTemplateColumns: "minmax(15rem, 18rem) minmax(0, 1fr)" }}
        >
          <section
            aria-label="Agent library"
            data-testid="agents-library"
            style={{
              display: "grid",
              gap: "0.85rem",
              alignContent: "start",
            }}
          >
            <Card
              description="Browse saved agents, switch to the active draft, and choose what the editor should shape next."
              title="Agent Library"
              tone="accent"
            />
            {agents.length === 0 ? (
              <Card description="No saved agents yet." title="Saved Agents" tone="soft" />
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {agents.map((agent) => {
                  const active = agent.id === selectedAgentId && !draftAgent;

                  return (
                    <button
                      key={agent.id}
                      onClick={() => {
                        setSelectedAgentId(agent.id);
                        setDraftAgent(null);
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        textAlign: "left",
                      }}
                      type="button"
                    >
                      <Card description={agent.description} title={agent.name} tone={active ? "accent" : "soft"}>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.5rem",
                            marginTop: "0.75rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <StatusBadge tone={active ? "accent" : "soft"}>
                            {active ? "Open in editor" : "Saved agent"}
                          </StatusBadge>
                        </div>
                      </Card>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section
            aria-label="Agent editor surface"
            data-testid="agents-editor"
            style={{ display: "grid", gap: "1rem", alignContent: "start" }}
          >
            <div data-testid="agents-quick-create">
              <Card
                description="Describe the role you want and Nuka drafts the provider-backed preset, tools, and access policy."
                title="Create From One Sentence"
                tone="accent"
              >
                <div className="split-row" style={{ marginTop: "1rem" }}>
                  <input
                    aria-label="Agent request"
                    className="field-input"
                    onChange={(event) => setRequest(event.target.value)}
                    value={request}
                  />
                  <button className="composer__send" onClick={() => void handleGenerateDraft()} type="button">
                    {isGenerating ? "Creating..." : "Create"}
                  </button>
                </div>
              </Card>
            </div>

            {error ? <Card description={error} title={errorTitle ?? "Agent Error"} tone="soft" /> : null}

            <Card
              description={
                detailAgent
                  ? detailAgent.description
                  : "Select a saved agent or generate a draft to edit its role, provider context, and allowed tools."
              }
              title={detailAgent?.name ?? "Agent Editor"}
              tone="soft"
            >
              {detailAgent ? (
                <div style={{ display: "grid", gap: "1rem" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    <StatusBadge tone={draftAgent ? "warning" : "accent"}>
                      {draftAgent ? "Draft" : "Saved"}
                    </StatusBadge>
                    <StatusBadge tone="soft">
                      {detailAgent.providerId ? "Provider attached" : "Provider pending"}
                    </StatusBadge>
                  </div>
                  <section>
                    <h3 style={{ margin: 0 }}>System Prompt</h3>
                    <p style={{ margin: "0.5rem 0 0", color: "var(--color-ink-soft)" }}>
                      {detailAgent.systemPrompt}
                    </p>
                  </section>
                  <section>
                    <h3 style={{ margin: 0 }}>Provider context</h3>
                    <p style={{ margin: "0.5rem 0 0", color: "var(--color-ink-soft)" }}>
                      {detailAgent.providerId ?? "No provider"}
                    </p>
                  </section>
                  <ToolBindingsPanel
                    title="Allowed Tools"
                    toolNames={detailAgent.toolNames}
                  />
                  <section>
                    <h3 style={{ margin: 0 }}>Memory and knowledge bindings</h3>
                    <p style={{ margin: "0.5rem 0 0", color: "var(--color-ink-soft)" }}>
                      Reserved for future memory graph links and knowledge library attachments.
                    </p>
                  </section>
                  <div className="settings-panel__footer">
                    {draftAgent ? (
                      <button
                        className="settings-button settings-button--accent"
                        onClick={() => void handleSaveDraft()}
                        type="button"
                      >
                        Save Agent
                      </button>
                    ) : selectedAgent ? (
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
              ) : null}
            </Card>
          </section>
        </div>

        <Inspector description="Shows the selected saved agent or the current generated draft." title="Agent Details">
          {detailAgent ? (
            <>
              <Card description={detailAgent.description} title={detailAgent.name} tone="accent" />
              <Card description={detailAgent.systemPrompt} title="System Prompt" tone="soft" />
              <Card description={detailAgent.providerId ?? "No provider"} title="Provider" tone="soft" />
              <ToolBindingsPanel title="Allowed Tools" toolNames={detailAgent.toolNames} />
              <Card
                description="Future memory graph links and knowledge library attachments will appear here."
                title="Memory and knowledge bindings"
                tone="soft"
              />
              {selectedAgent && !draftAgent ? (
                <button className="settings-button settings-button--danger" onClick={() => void handleDeleteSelected()} type="button">
                  Delete Agent
                </button>
              ) : null}
            </>
          ) : (
            <Card description="Select an agent or generate a draft to inspect its real details." title="Agent Details" />
          )}
        </Inspector>
      </div>
    </div>
  );
}
