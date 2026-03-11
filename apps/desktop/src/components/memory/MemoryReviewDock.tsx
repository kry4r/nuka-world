import { useId, useState } from "react";
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

function MemoryReviewChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="memory-review-dock__chevron"
      viewBox="0 0 16 16"
    >
      {expanded ? <path d="M4 10.5 8 6.5l4 4" /> : <path d="M4 6 8 10l4-4" />}
    </svg>
  );
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
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

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
    <div className={`memory-review-dock ${expanded ? "is-open" : "is-closed"}`}>
      <button
        aria-controls={panelId}
        aria-expanded={expanded}
        className="memory-review-dock__toggle"
        data-testid="memory-review-toggle"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <MemoryReviewChevron expanded={expanded} />
        <span className="memory-review-dock__toggle-copy">
          <span className="memory-review-dock__toggle-title">Memory Review</span>
          <span className="memory-review-dock__toggle-meta">{queueLabel}</span>
        </span>
        <span className="memory-review-dock__toggle-summary">{summary}</span>
      </button>

      {expanded ? (
        <section
          aria-label="Memory review panel"
          className="memory-review-dock__panel"
          data-testid="memory-review-panel"
          id={panelId}
        >
        {candidate ? (
          <>
            <div className="memory-review-dock__panel-header">
              <div className="memory-review-dock__panel-copy">
                <span className="memory-review-dock__panel-kicker">{queueLabel}</span>
                <strong>{candidate.title}</strong>
                <span>{candidate.reason}</span>
              </div>
              <div className="memory-review-dock__panel-stats">
                <span>Schema {candidate.suggestedSchemaId ?? "未建议"}</span>
                <span>证据 {candidate.evidenceCount}</span>
                <span>置信度 {Math.round(candidate.confidence * 100)}%</span>
              </div>
            </div>

            <div className="memory-review-dock__decision-row">
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

            <div className="memory-review-dock__footer">
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
        </section>
      ) : null}
    </div>
  );
}
