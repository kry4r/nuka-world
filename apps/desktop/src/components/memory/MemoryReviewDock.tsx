import { Card } from "@/components/ui/Card";
import type { MemoryReviewDecision } from "@/lib/memory";
import type { MemoryReviewDockState } from "@/hooks/useMemoryReviewDock";

const DECISION_OPTIONS: Array<{
  value: MemoryReviewDecision;
  label: string;
}> = [
  { value: "promote_semantic", label: "转入长期语义记忆" },
  { value: "keep_episodic", label: "暂留为情景记忆" },
  { value: "reject", label: "拒绝" },
];

function surfaceLabel(surface: "chat" | "workflow") {
  return surface === "chat" ? "Chat" : "Workflow";
}

export function MemoryReviewDock({
  applyDecision,
  candidate,
  error,
  isApplying,
  isLoading,
  queueCount,
  queuePosition,
  selectedDecision,
  setSelectedDecision,
}: MemoryReviewDockState) {
  if (!candidate && !error && !isLoading) {
    return null;
  }

  return (
    <Card
      className="memory-review-dock"
      description={
        candidate
          ? `${surfaceLabel(candidate.surface)} · ${queuePosition} / ${queueCount}`
          : "Memory review"
      }
      title="Memory Review"
      tone="accent"
    >
      <div style={{ display: "grid", gap: "0.85rem" }}>
        {candidate ? (
          <>
            <div style={{ display: "grid", gap: "0.3rem" }}>
              <strong>{candidate.title}</strong>
              <span>
                Schema {candidate.suggestedSchemaId ?? "未建议"} · 证据 {candidate.evidenceCount} ·
                置信度 {Math.round(candidate.confidence * 100)}%
              </span>
              <span>{candidate.reason}</span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
              {DECISION_OPTIONS.map((option) => (
                <button
                  aria-pressed={selectedDecision === option.value}
                  className={
                    selectedDecision === option.value
                      ? "settings-button settings-button--accent"
                      : "settings-button"
                  }
                  key={option.value}
                  onClick={() => setSelectedDecision(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="settings-panel__footer">
              <button
                className="settings-button settings-button--accent"
                disabled={isApplying}
                onClick={() => {
                  void applyDecision();
                }}
                type="button"
              >
                {isApplying ? "应用中..." : "应用审核"}
              </button>
            </div>
          </>
        ) : null}

        {isLoading ? <span>Loading memory review…</span> : null}
        {error ? <span>{error}</span> : null}
      </div>
    </Card>
  );
}
