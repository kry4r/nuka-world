import type { TeamRunRecord } from "@/lib/team";

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

function formatRunStatus(value: string) {
  if (value === "waiting_for_user") {
    return "Waiting for Input";
  }

  return titleCase(value);
}

export function RunCharterCard({ run }: RunCharterCardProps) {
  return (
    <details className="run-charter-card ui-card">
      <summary className="run-charter-card__summary">
        <div className="run-charter-card__summary-copy">
          <span className="run-charter-card__eyebrow">Run details</span>
          <strong>{run.title}</strong>
          <span className="run-charter-card__summary-hint">Show the run context</span>
        </div>
        <span aria-hidden="true" className="run-charter-card__summary-icon" />
      </summary>

      <div className="run-charter-card__body">
        <p className="run-charter-card__goal">{run.goal}</p>

        <dl className="run-charter-card__grid">
          <div className="run-charter-card__metric">
            <dt>Status</dt>
            <dd>{formatRunStatus(run.status)}</dd>
          </div>
          <div className="run-charter-card__metric">
            <dt>Phase</dt>
            <dd>{titleCase(run.currentPhase)}</dd>
          </div>
          <div className="run-charter-card__metric">
            <dt>Success</dt>
            <dd>{run.charter.successCriteria}</dd>
          </div>
          <div className="run-charter-card__metric">
            <dt>Output</dt>
            <dd>{run.charter.outputFormat}</dd>
          </div>
          <div className="run-charter-card__metric">
            <dt>Budget</dt>
            <dd>{run.charter.budgetPolicy}</dd>
          </div>
          <div className="run-charter-card__metric">
            <dt>Rounds</dt>
            <dd>
              {run.charter.maxActiveAgentsPerRound} agents,{" "}
              {run.charter.maxMessagesPerAgentPerRound} messages
            </dd>
          </div>
        </dl>
      </div>
    </details>
  );
}
