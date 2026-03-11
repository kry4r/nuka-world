import type { ToolBindingRecord } from "@/lib/team";

type TeamToolBindingsPanelProps = {
  bindings: ToolBindingRecord[];
  onToggle: (toolId: string, allowed: boolean) => void;
};

export function TeamToolBindingsPanel({
  bindings,
  onToggle,
}: TeamToolBindingsPanelProps) {
  return (
    <div className="team-tool-bindings">
      <div className="team-tool-bindings__header">
        <h4>Allowed tools</h4>
      </div>

      {bindings.length === 0 ? (
        <div className="team-tool-bindings__empty">No tools assigned.</div>
      ) : (
        <div className="team-tool-bindings__list">
          {bindings.map((binding) => (
            <label className="team-tool-bindings__item" key={binding.toolId}>
              <input
                checked={binding.allowed}
                onChange={(event) => onToggle(binding.toolId, event.target.checked)}
                type="checkbox"
              />
              <div className="team-tool-bindings__copy">
                <span className="team-tool-bindings__name">{binding.toolId}</span>
                <span className="team-tool-bindings__meta">
                  {binding.purpose || "No purpose specified"} · {binding.costClass}
                </span>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
