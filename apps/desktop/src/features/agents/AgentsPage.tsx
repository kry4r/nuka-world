import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";

type ToolBindingSetResponse = {
  names: string[];
};

export function AgentsPage() {
  const [toolNames, setToolNames] = useState<string[]>(["codex", "git", "search_knowledge"]);

  useEffect(() => {
    let alive = true;

    void invoke<ToolBindingSetResponse>("default_agent_tool_bindings")
      .then((response) => {
        if (alive) {
          setToolNames(response.names);
        }
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="page-layout">
      <SectionHeader
        meta="Quick-create, presets, and tool access"
        status="Create Flow"
        tag="Agents"
        title="Create From One Sentence"
      />

      <div className="page-layout__body">
        <div className="page-layout__main">
          <Card
            description="Describe the role you want and Nuka drafts the preset, tools, and access policy."
            title="Create From One Sentence"
            tone="accent"
          />

          <div className="split-row">
            <input
              className="field-input"
              defaultValue="Create an agent that researches release notes and writes short weekly digests."
            />
            <button className="composer__send" type="button">
              Create
            </button>
          </div>

          <div className="card-grid">
            <Card description="Research editor" title="Role" />
            <Card description="Balanced GPT profile" title="Model" />
            <Card description={toolNames.join(", ")} title="Tools" />
            <Card description="Session and knowledge read" title="Access" />
          </div>

          <Card title="Preset Library">
            <div className="workflow-grid">
              <Card description="Synthesis and retrieval" title="Researcher" tone="soft" />
              <Card description="Checks quality and policy" title="Reviewer" tone="soft" />
              <Card description="Routes tasks and memory" title="Coordinator" tone="soft" />
            </div>
          </Card>

          <Card
            description="One sentence becomes a role, provider preference, tool bindings, and memory scope before save."
            title="Generated Draft"
          />
        </div>

        <Inspector description="Review the parsed intent before creating the preset." title="Draft Inspector">
          <Card description="Summarize release notes every week" title="Intent" />
          <Card description="Balanced default with Claude fallback" title="Provider" />
          <Card description={toolNames.join(", ")} title="Tool Access" />
          <Card description="Creates a reusable preset with editable defaults" title="Save Result" />
        </Inspector>
      </div>
    </div>
  );
}
