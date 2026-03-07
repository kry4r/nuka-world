import { ToolBindingsPanel } from "./ToolBindingsPanel";

const DEFAULT_TOOLS = ["codex", "git", "search_knowledge"];

export function AgentsPage() {
  return (
    <section>
      <h2>Agent Presets</h2>
      <p>Preset agents can bind multiple tools.</p>
      <ToolBindingsPanel toolNames={DEFAULT_TOOLS} />
    </section>
  );
}
