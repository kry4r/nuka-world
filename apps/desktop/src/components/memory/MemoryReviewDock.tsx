import type { MemoryReviewDecision } from "@/lib/memory";
import type { MemoryReviewDockState } from "@/hooks/useMemoryReviewDock";

const DECISION_OPTIONS: Array<{
  value: MemoryReviewDecision;
  label: string;
}> = [
  { value: "promote_semantic", label: "转入长期" },
  { value: "keep_episodic", label: "留存短期" },
  { value: "reject", label: "拒绝" },
];

export function MemoryReviewDock({
  applyDecision,
  candidate,
  error,
  isApplying,
  isLoading,
}: MemoryReviewDockState) {
  if (!candidate && !error && !isLoading) {
    return null;
  }

  const summary = error ? "Memory review unavailable" : "Loading memory review...";

  return (
    <article
      aria-label="Memory review message"
      className="memory-review-inline chat-bubble chat-bubble--world"
      data-testid="memory-review-inline"
    >
      {candidate ? (
        <>
          <div className="memory-review-inline__copy">
            <strong className="memory-review-inline__title">{candidate.title}</strong>
            {candidate.body ? (
              <p className="memory-review-inline__body">{candidate.body}</p>
            ) : null}
          </div>

          {candidate.relatedTitles.length > 0 ? (
            <div className="memory-review-inline__related">
              <span className="memory-review-inline__related-label">关联节点</span>
              <div className="memory-review-inline__related-list">
                {candidate.relatedTitles.map((relatedTitle) => (
                  <span className="memory-review-inline__related-chip" key={relatedTitle}>
                    {relatedTitle}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="memory-review-inline__actions">
            {DECISION_OPTIONS.map((option) => (
              <button
                className="settings-button"
                disabled={isApplying}
                key={option.value}
                onClick={() => {
                  void applyDecision(option.value);
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {isLoading ? <p className="memory-review-inline__body">Loading memory review...</p> : null}
      {error ? <p className="memory-review-inline__body">{error}</p> : null}
      {!candidate && !error && !isLoading ? (
        <p className="memory-review-inline__body">{summary}</p>
      ) : null}
    </article>
  );
}
