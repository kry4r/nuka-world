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
  return surface === "chat" ? "Chat" : "Team";
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

  const queueLabel = candidate
    ? `${surfaceLabel(candidate.surface)} · ${queuePosition} / ${queueCount}`
    : "Memory review";
  const summary = candidate
    ? candidate.title
    : error
      ? "Memory review unavailable"
      : "Loading memory review…";

  return (
    <article
      aria-label="Memory review message"
      className="memory-review-inline chat-bubble chat-bubble--world"
      data-testid="memory-review-inline"
    >
      <div className="memory-review-inline__header">
        <span className="chat-bubble__label">Agent memory review</span>
        <span className="memory-review-inline__meta">{queueLabel}</span>
      </div>

      {candidate ? (
        <>
          <div className="memory-review-inline__copy">
            <strong className="memory-review-inline__title">{candidate.title}</strong>
            <p className="memory-review-inline__reason">{candidate.reason}</p>
          </div>

          <div className="memory-review-inline__stats">
            <span>Schema {candidate.suggestedSchemaId ?? "未建议"}</span>
            <span>证据 {candidate.evidenceCount}</span>
            <span>置信度 {Math.round(candidate.confidence * 100)}%</span>
          </div>

          <div className="memory-review-inline__decision-row">
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

          <div className="memory-review-inline__footer">
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

      {isLoading ? (
        <p className="memory-review-inline__reason">Loading memory review…</p>
      ) : null}
      {error ? <p className="memory-review-inline__reason">{error}</p> : null}
      {!candidate && !error && !isLoading ? (
        <p className="memory-review-inline__reason">{summary}</p>
      ) : null}
    </article>
  );
}
