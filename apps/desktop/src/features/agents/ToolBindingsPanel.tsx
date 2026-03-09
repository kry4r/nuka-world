import { StatusBadge } from "@/components/ui/StatusBadge";

type ToolBindingsPanelProps = {
  toolNames: string[];
  title?: string;
};

export function ToolBindingsPanel({ toolNames, title = "Tool Bindings" }: ToolBindingsPanelProps) {
  return (
    <section aria-label={title} className="tool-bindings-panel">
      <h3>{title}</h3>
      {toolNames.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginTop: "0.75rem",
          }}
        >
          {toolNames.map((toolName) => (
            <StatusBadge key={toolName} tone="soft">
              {toolName}
            </StatusBadge>
          ))}
        </div>
      ) : (
        <p style={{ margin: "0.75rem 0 0", color: "var(--color-text-soft)" }}>No tools assigned</p>
      )}
    </section>
  );
}
