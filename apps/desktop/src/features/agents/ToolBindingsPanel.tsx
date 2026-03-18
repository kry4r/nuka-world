import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/lib/i18n";

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
  const { locale } = useI18n();
  const helperCopy =
    locale === "zh-CN" ? "使用逗号分隔工具 ID" : "Comma-separated tool ids";
  const emptyCopy = locale === "zh-CN" ? "暂未分配工具" : "No tools assigned";
  const inputLabel = locale === "zh-CN" ? "允许工具" : "Allowed tools";

  return (
    <section aria-label={title} className="tool-bindings-panel">
      <div className="tool-bindings-panel__header">
        <h3>{title}</h3>
        {onInputValueChange ? <span>{helperCopy}</span> : null}
      </div>

      {onInputValueChange ? (
        <label className="agents-field">
          <span className="agents-field__label">{inputLabel}</span>
          <input
            aria-label={inputLabel}
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
        <p className="tool-bindings-panel__empty">{emptyCopy}</p>
      )}
    </section>
  );
}
