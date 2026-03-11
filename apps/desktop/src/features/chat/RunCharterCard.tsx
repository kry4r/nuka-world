import type { TeamRunRecord } from "@/lib/team";

type RunCharterCardProps = {
  run: TeamRunRecord;
};

export function RunCharterCard({ run }: RunCharterCardProps) {
  return (
    <section className="run-charter-card ui-card">
      <div className="run-charter-card__header">
        <div>
          <span className="run-charter-card__eyebrow">Run charter</span>
          <h2>{run.title}</h2>
        </div>
        <div className="run-charter-card__badges">
          <span className="status-badge status-badge--soft">{run.status}</span>
          <span className="status-badge status-badge--soft">{run.currentPhase}</span>
        </div>
      </div>

      <p className="run-charter-card__goal">{run.goal}</p>

      <dl className="run-charter-card__grid">
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
            {run.charter.maxActiveAgentsPerRound} agents 路 {run.charter.maxMessagesPerAgentPerRound} messages
          </dd>
        </div>
      </dl>
    </section>
  );
}
