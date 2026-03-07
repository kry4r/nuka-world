type ToolBindingsPanelProps = {
  toolNames: string[];
};

export function ToolBindingsPanel({ toolNames }: ToolBindingsPanelProps) {
  return (
    <section>
      <h3>Tool Bindings</h3>
      <ul>
        {toolNames.map((toolName) => (
          <li key={toolName}>{toolName}</li>
        ))}
      </ul>
    </section>
  );
}
