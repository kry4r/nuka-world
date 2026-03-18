import type { MemoryReviewDecision } from "@/lib/memory";
import type { MemoryReviewDockState } from "@/hooks/useMemoryReviewDock";
import { useI18n } from "@/lib/i18n";

const DECISION_OPTIONS: Array<{
  value: MemoryReviewDecision;
  label: string;
}> = [
  { value: "promote_semantic", label: "转入长期" },
  { value: "keep_episodic", label: "留存短期" },
  { value: "reject", label: "拒绝" },
];

function localizeReviewReason(
  reason: string,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (reason === "Chat turn proposed for review") {
    return t("chat.memory.reason.chat");
  }

  if (/^Team run round .+ proposed for review$/i.test(reason)) {
    return t("chat.memory.reason.teamRun");
  }

  if (/^Workflow turn .+ proposed for review$/i.test(reason)) {
    return t("chat.memory.reason.workflow");
  }

  return reason;
}

function renderCandidateBody(
  body: string,
  t: ReturnType<typeof useI18n>["t"],
) {
  const lines = body.split(/\r?\n/).filter(Boolean);

  return lines.map((line, index) => {
    const reasonMatch = line.match(/^记录缘由：\s*(.+)$/);
    const content = reasonMatch
      ? `记录缘由：${localizeReviewReason(reasonMatch[1].trim(), t)}`
      : line;

    return (
      <span key={`${content}-${index}`}>
        <span className="memory-review-inline__body-line">
          {content}
        </span>
        {index < lines.length - 1 ? <br /> : null}
      </span>
    );
  });
}

export function MemoryReviewDock({
  applyDecision,
  candidate,
  error,
  isApplying,
  isLoading,
}: MemoryReviewDockState) {
  const { t } = useI18n();

  if (!candidate && !error && !isLoading) {
    return null;
  }

  const summary = error ? t("chat.memory.unavailable") : t("chat.memory.loading");

  return (
    <article
      aria-label={t("chat.memory.aria")}
      className="memory-review-inline chat-bubble chat-bubble--world"
      data-testid="memory-review-inline"
    >
      {candidate ? (
        <>
          <div className="memory-review-inline__copy">
            <strong className="memory-review-inline__title">{candidate.title}</strong>
            {candidate.body ? (
              <p className="memory-review-inline__body">
                {renderCandidateBody(candidate.body, t)}
              </p>
            ) : null}
          </div>

          {candidate.relatedTitles.length > 0 ? (
            <div className="memory-review-inline__related">
              <span className="memory-review-inline__related-label">
                {t("chat.memory.related")}
              </span>
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

      {isLoading ? (
        <p className="memory-review-inline__body">{t("chat.memory.loading")}</p>
      ) : null}
      {error ? <p className="memory-review-inline__body">{error}</p> : null}
      {!candidate && !error && !isLoading ? (
        <p className="memory-review-inline__body">{summary}</p>
      ) : null}
    </article>
  );
}
