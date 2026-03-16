import type { TeamRunAgentRecord, TeamRunEventRecord } from "@/lib/team";

type AgentTeamStripProps = {
  agents: TeamRunAgentRecord[];
  events: TeamRunEventRecord[];
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

function latestAgentEvent(events: TeamRunEventRecord[], agentId: string) {
  return (
    [...events]
      .reverse()
      .find((event) => event.agentId === agentId && event.kind !== "file_change") ?? null
  );
}

function agentStatusTone(status: string) {
  switch (status) {
    case "done":
    case "completed":
      return "complete";
    case "thinking":
    case "waiting":
      return "pending";
    case "blocked":
    case "stuck":
      return "blocked";
    default:
      return "neutral";
  }
}

function toolStateLabel(agent: TeamRunAgentRecord) {
  return humanizeActivityLabel(agent.lastToolActivity) ?? "No tool activity yet";
}

function latestUpdateLabel(events: TeamRunEventRecord[], agent: TeamRunAgentRecord) {
  const event = latestAgentEvent(events, agent.id);
  if (!event) {
    return "No session update yet";
  }

  return event.title;
}

export function AgentTeamStrip({ agents, events, leadAgentId }: AgentTeamStripProps) {
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
              <div className="agent-team-strip__presence">
                {isLead ? <span className="agent-team-strip__lead">Lead agent</span> : null}
                <span className="agent-team-strip__status">
                  <span
                    aria-hidden="true"
                    className={`agent-team-strip__status-light agent-team-strip__status-light--${agentStatusTone(agent.status)}`}
                  />
                  {formatAgentStatus(agent.status)}
                </span>
              </div>
            </div>
            <div className="agent-team-strip__detail-stack">
              <div className="agent-team-strip__detail">
                <span className="agent-team-strip__detail-label">Current work</span>
                <p>{workLabel(agent)}</p>
              </div>
              <div className="agent-team-strip__detail">
                <span className="agent-team-strip__detail-label">Latest update</span>
                <p>{latestUpdateLabel(events, agent)}</p>
              </div>
              <div className="agent-team-strip__detail">
                <span className="agent-team-strip__detail-label">Tool state</span>
                <p>{toolStateLabel(agent)}</p>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
