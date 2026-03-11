import type { TeamRunAgentRecord } from "@/lib/team";

type AgentTeamStripProps = {
  agents: TeamRunAgentRecord[];
  leadAgentId: string | null;
};

function workLabel(agent: TeamRunAgentRecord) {
  return agent.lastToolActivity ?? agent.currentWork;
}

export function AgentTeamStrip({ agents, leadAgentId }: AgentTeamStripProps) {
  return (
    <section aria-label="Agent team strip" className="agent-team-strip">
      {agents.map((agent) => {
        const isLead = agent.id === leadAgentId;

        return (
          <article
            className={`agent-team-strip__card${isLead ? " is-lead" : ""}`}
            data-lead={isLead}
            key={agent.id}
          >
            <div className="agent-team-strip__card-top">
              <div className="agent-team-strip__identity">
                <strong>{agent.name}</strong>
                <span>{agent.role}</span>
              </div>
              <span className="agent-team-strip__status">{agent.status}</span>
            </div>
            <p>{workLabel(agent)}</p>
          </article>
        );
      })}
    </section>
  );
}
