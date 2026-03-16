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
  if (value === "waiting_for_user") {
    return t("teamRun.state.waitingForInput");
  }

  return titleCase(value);
}

export function RunCharterCard({ run }: RunCharterCardProps) {
  const { t } = useI18n();

  return (
    <details className="run-charter-card ui-card">
      <summary className="run-charter-card__summary">
        <div className="run-charter-card__summary-copy">
          <span className="run-charter-card__eyebrow">{t("teamRun.details.title")}</span>
          <strong>{run.title}</strong>
        </div>
        <span aria-hidden="true" className="run-charter-card__summary-icon" />
      </summary>

      <div className="run-charter-card__body">
        <p className="run-charter-card__goal">{run.goal}</p>

        <dl className="run-charter-card__grid">
          <div className="run-charter-card__metric">
            <dt>{t("teamRun.details.status")}</dt>
            <dd>{formatRunStatus(run.status, t)}</dd>
          </div>
          <div className="run-charter-card__metric">
            <dt>{t("teamRun.details.phase")}</dt>
            <dd>{titleCase(run.currentPhase)}</dd>
          </div>
          <div className="run-charter-card__metric">
            <dt>{t("teamRun.details.success")}</dt>
            <dd>{run.charter.successCriteria}</dd>
          </div>
          <div className="run-charter-card__metric">
            <dt>{t("teamRun.details.output")}</dt>
            <dd>{run.charter.outputFormat}</dd>
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
      </div>
    </details>
  );
}
