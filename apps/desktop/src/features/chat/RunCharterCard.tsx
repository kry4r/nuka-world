import type { ReactNode } from "react";
import type { TeamRunRecord } from "@/lib/team";
import { useI18n } from "@/lib/i18n";

type RunCharterCardProps = {
  run: TeamRunRecord;
};

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatRunStatus(value: string, t: ReturnType<typeof useI18n>["t"]) {
  switch (value.trim().toLowerCase()) {
    case "waiting_for_user":
      return t("teamRun.state.waitingForInput");
    case "completed":
    case "done":
      return t("teamRun.state.completed");
    case "blocked":
      return t("teamRun.state.blocked");
    case "stuck":
      return t("teamRun.state.stuck");
    case "queued":
      return t("teamRun.state.queued");
    case "running":
      return t("teamRun.state.running");
    case "budget_paused":
      return t("teamRun.state.budgetPaused");
    default:
      return titleCase(value);
  }
}

function formatRunPhase(value: string, t: ReturnType<typeof useI18n>["t"]) {
  switch (value.trim().toLowerCase()) {
    case "analysis":
      return t("teamRun.phase.analysis");
    case "review":
      return t("teamRun.phase.review");
    case "kickoff":
      return t("teamRun.phase.kickoff");
    default:
      return titleCase(value);
  }
}

function formatOutputFormat(value: string, t: ReturnType<typeof useI18n>["t"]) {
  switch (value.trim().toLowerCase()) {
    case "checkpoint_summary":
      return t("teamRun.event.checkpointSummary");
    case "position_card":
      return t("teamRun.event.positionCard");
    default:
      return value.includes("_") ? titleCase(value) : value;
  }
}

function parseStringList(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const items = parsed.map((item) => String(item).trim()).filter(Boolean);

    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

function renderMetricValue(value: string, className: string): ReactNode {
  const parsedList = parseStringList(value);
  if (!parsedList) {
    return value;
  }

  return (
    <ul className={className}>
      {parsedList.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function RunCharterCard({ run }: RunCharterCardProps) {
  const { t } = useI18n();
  const stopConditions = run.charter.stopConditions.filter(Boolean);

  return (
    <details className="run-charter-card ui-card">
      <summary className="run-charter-card__summary">
        <div className="run-charter-card__summary-copy">
          <span className="run-charter-card__eyebrow">
            {t("teamRun.details.title")}
          </span>
          <strong>{run.title}</strong>
        </div>
        <span aria-hidden="true" className="run-charter-card__summary-icon" />
      </summary>

      <div className="run-charter-card__body">
        <section className="run-charter-card__goal-panel">
          <span className="run-charter-card__section-label">
            {t("teamRun.details.goal")}
          </span>
          <p className="run-charter-card__goal">{run.goal}</p>
        </section>

        <div className="run-charter-card__aside">
          <dl className="run-charter-card__grid">
            <div className="run-charter-card__metric">
              <dt>{t("teamRun.details.status")}</dt>
              <dd>{formatRunStatus(run.status, t)}</dd>
            </div>
            <div className="run-charter-card__metric">
              <dt>{t("teamRun.details.phase")}</dt>
              <dd>{formatRunPhase(run.currentPhase, t)}</dd>
            </div>
            <div className="run-charter-card__metric">
              <dt>{t("teamRun.details.success")}</dt>
              <dd>
                {renderMetricValue(
                  run.charter.successCriteria,
                  "run-charter-card__metric-list",
                )}
              </dd>
            </div>
            <div className="run-charter-card__metric">
              <dt>{t("teamRun.details.output")}</dt>
              <dd>{formatOutputFormat(run.charter.outputFormat, t)}</dd>
            </div>
            <div className="run-charter-card__metric">
              <dt>{t("teamRun.details.budget")}</dt>
              <dd>{run.charter.budgetPolicy}</dd>
            </div>
            <div className="run-charter-card__metric">
              <dt>{t("teamRun.details.rounds")}</dt>
              <dd>
                {t("teamRun.details.roundsSummary", {
                  agents: run.charter.maxActiveAgentsPerRound,
                  messages: run.charter.maxMessagesPerAgentPerRound,
                })}
              </dd>
            </div>
          </dl>

          {stopConditions.length > 0 ? (
            <section className="run-charter-card__goal-panel run-charter-card__goal-panel--compact">
              <span className="run-charter-card__section-label">
                {t("teamRun.details.stopConditions")}
              </span>
              <ul className="run-charter-card__stop-list">
                {stopConditions.map((condition) => (
                  <li key={condition}>{formatRunStatus(condition, t)}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </details>
  );
}
