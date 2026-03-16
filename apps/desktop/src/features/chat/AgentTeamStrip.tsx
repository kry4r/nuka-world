import type { TeamRunAgentRecord } from "@/lib/team";

type AgentTeamStripProps = {
  agents: TeamRunAgentRecord[];
  leadAgentId: string | null;
};

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatAgentStatus(value: string) {
  if (value === "waiting") {
    return "Waiting";
  }

  if (value === "thinking") {
    return "Thinking";
  }

  return titleCase(value);
}

function humanizeActivityLabel(value: string | null) {
  if (!value) {
    return null;
  }

  if (value === "session_artifacts") {
    return "Session Artifacts";
  }

  return value.includes("_") ? titleCase(value) : value;
}

function agentOriginLabel(agent: TeamRunAgentRecord) {
  if (!agent.sourceTeamAssignmentId && !agent.sourceTeamAgentId) {
    return "Runtime agent";
  }

  return "Team agent";
}

function workLabel(agent: TeamRunAgentRecord) {
  return agent.currentWork || humanizeActivityLabel(agent.lastToolActivity) || "Standing by";
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
              <div className="agent-team-strip__identity-line">
                <span aria-hidden="true" className="agent-team-strip__avatar" />
                <div className="agent-team-strip__identity">
                  <strong>{agent.name}</strong>
                  <span>
                    {agent.role}
                    {" · "}
                    {agentOriginLabel(agent)}
                  </span>
                </div>
              </div>
              <span className="agent-team-strip__status">{formatAgentStatus(agent.status)}</span>
            </div>
            <div className="agent-team-strip__detail-stack">
              <div className="agent-team-strip__detail">
                <span className="agent-team-strip__detail-label">Session work</span>
                <p>{workLabel(agent)}</p>
              </div>
              {agent.lastToolActivity ? (
                <div className="agent-team-strip__detail">
                  <span className="agent-team-strip__detail-label">Recent activity</span>
                  <p>{humanizeActivityLabel(agent.lastToolActivity)}</p>
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}
