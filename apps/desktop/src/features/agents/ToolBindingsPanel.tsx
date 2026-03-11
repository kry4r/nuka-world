import { StatusBadge } from "@/components/ui/StatusBadge";

type ToolBindingsPanelProps = {
  inputValue?: string;
  onInputValueChange?: (value: string) => void;
  toolNames: string[];
  title?: string;
};

export function ToolBindingsPanel({
  inputValue,
  onInputValueChange,
  toolNames,
  title = "Tool Bindings",
}: ToolBindingsPanelProps) {
  return (
    <section aria-label={title} className="tool-bindings-panel">
      <div className="tool-bindings-panel__header">
        <h3>{title}</h3>
        {onInputValueChange ? <span>Comma-separated tool ids</span> : null}
      </div>

      {onInputValueChange ? (
        <label className="agents-field">
          <span className="agents-field__label">Allowed tools</span>
          <input
            aria-label="Allowed tools"
            className="field-input"
            onChange={(event) => onInputValueChange(event.target.value)}
            value={inputValue ?? toolNames.join(", ")}
          />
        </label>
      ) : null}

      {toolNames.length > 0 ? (
        <div className="tool-bindings-panel__chips">
          {toolNames.map((toolName) => (
            <StatusBadge key={toolName} tone="soft">
              {toolName}
            </StatusBadge>
          ))}
        </div>
      ) : (
        <p className="tool-bindings-panel__empty">No tools assigned</p>
      )}
    </section>
  );
}
