type ToolBindingsPanelProps = {
  toolNames: string[];
  title?: string;
};

export function ToolBindingsPanel({ toolNames, title = "Tool Bindings" }: ToolBindingsPanelProps) {
  return (
    <section>
      <h3>{title}</h3>
      <ul>
        {toolNames.map((toolName) => (
          <li key={toolName}>{toolName}</li>
        ))}
      </ul>
    </section>
  );
}
