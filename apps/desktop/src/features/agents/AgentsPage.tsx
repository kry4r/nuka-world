import { useEffect, useMemo, useState } from "react";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  defaultAgentToolBindings,
  deleteAgent,
  generateAgentDraft,
  listAgents,
  saveAgent,
  type AgentRecord,
} from "@/lib/agents";
import { ToolBindingsPanel } from "./ToolBindingsPanel";

const DEFAULT_REQUEST = "Create an agent that researches release notes and writes short weekly digests.";

export function AgentsPage() {
  const [toolNames, setToolNames] = useState<string[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [draftAgent, setDraftAgent] = useState<AgentRecord | null>(null);
  const [request, setRequest] = useState(DEFAULT_REQUEST);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void Promise.all([defaultAgentToolBindings(), listAgents()])
      .then(([bindings, savedAgents]) => {
        if (!alive) {
          return;
        }

        setToolNames(bindings.names);
        setAgents(savedAgents);
        setSelectedAgentId(savedAgents[0]?.id ?? null);
      })
      .catch(() => undefined);

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

    setError(null);
    setIsGenerating(true);

    try {
      const draft = await generateAgentDraft(request);
      setDraftAgent(draft);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!draftAgent) {
      return;
    }

    const saved = await saveAgent(draftAgent);
    setAgents((current) => [...current, saved]);
    setSelectedAgentId(saved.id);
    setDraftAgent(null);
  };

  const handleDeleteSelected = async () => {
    if (!selectedAgent) {
      return;
    }

    await deleteAgent(selectedAgent.id);
    setAgents((current) => current.filter((agent) => agent.id !== selectedAgent.id));
    setSelectedAgentId(null);
  };

  return (
    <div className="page-layout">
      <SectionHeader
        meta="Quick-create, presets, and tool access"
        status="Create Flow"
        tag="Agents"
        title="Agents"
      />

      <div className="page-layout__body">
        <div className="page-layout__main">
          <Card
            description="Describe the role you want and Nuka drafts the provider-backed preset, tools, and access policy."
            title="Create From One Sentence"
            tone="accent"
          />

          <div className="split-row">
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

          {error ? <Card description={error} title="Agent Draft Error" tone="soft" /> : null}

          <Card title="Saved Agents">
            {agents.length === 0 ? (
              <p>No saved agents yet.</p>
            ) : (
              <div className="workflow-grid">
                {agents.map((agent) => (
                  <button
                    className="settings-panel__trigger"
                    key={agent.id}
                    onClick={() => {
                      setSelectedAgentId(agent.id);
                      setDraftAgent(null);
                    }}
                    type="button"
                  >
                    <Card description={agent.description} title={agent.name} tone={agent.id === selectedAgentId ? "accent" : "soft"} />
                  </button>
                ))}
              </div>
            )}
          </Card>

          {draftAgent ? (
            <Card description={draftAgent.description} title={draftAgent.name} tone="soft">
              <div className="settings-panel__footer">
                <button className="settings-button settings-button--accent" onClick={() => void handleSaveDraft()} type="button">
                  Save Agent
                </button>
              </div>
            </Card>
          ) : null}
        </div>

        <Inspector description="Shows the selected saved agent or the current generated draft." title="Agent Details">
          {detailAgent ? (
            <>
              <Card description={detailAgent.description} title={detailAgent.name} tone="accent" />
              <Card description={detailAgent.systemPrompt} title="System Prompt" tone="soft" />
              <Card description={detailAgent.providerId ?? "No provider"} title="Provider" tone="soft" />
              <ToolBindingsPanel title="Allowed Tools" toolNames={detailAgent.toolNames.length > 0 ? detailAgent.toolNames : toolNames} />
              {selectedAgent ? (
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
