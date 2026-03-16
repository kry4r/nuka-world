import type { TeamRunAgentRecord, TeamRunEventRecord } from "@/lib/team";
import { useI18n } from "@/lib/i18n";

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

function formatAgentStatus(value: string, t: ReturnType<typeof useI18n>["t"]) {
  if (value === "waiting") {
    return t("teamRun.state.waiting");
  }

  if (value === "thinking") {
    return t("teamRun.state.thinking");
  }

  if (value === "done" || value === "completed") {
    return t("teamRun.state.completed");
  }

  if (value === "blocked") {
    return t("teamRun.state.blocked");
  }

  if (value === "stuck") {
    return t("teamRun.state.stuck");
  }

  return titleCase(value);
}

function humanizeActivityLabel(
  value: string | null,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (!value) {
    return null;
  }

  if (value === "session_artifacts") {
    return t("teamRun.agent.sessionArtifacts");
  }

  return value.includes("_") ? titleCase(value) : value;
}

function agentOriginLabel(agent: TeamRunAgentRecord) {
  if (!agent.sourceTeamAssignmentId && !agent.sourceTeamAgentId) {
    return "runtime";
  }

  return "team";
}

function workLabel(agent: TeamRunAgentRecord, t: ReturnType<typeof useI18n>["t"]) {
  return (
    agent.currentWork ||
    humanizeActivityLabel(agent.lastToolActivity, t) ||
    t("teamRun.agent.standingBy")
  );
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

function toolStateLabel(agent: TeamRunAgentRecord, t: ReturnType<typeof useI18n>["t"]) {
  return humanizeActivityLabel(agent.lastToolActivity, t) ?? t("teamRun.agent.noToolActivity");
}

function latestUpdateLabel(
  events: TeamRunEventRecord[],
  agent: TeamRunAgentRecord,
  t: ReturnType<typeof useI18n>["t"],
) {
  const event = latestAgentEvent(events, agent.id);
  if (!event) {
    return t("teamRun.agent.noSessionUpdate");
  }

  return event.title;
}

export function AgentTeamStrip({ agents, events, leadAgentId }: AgentTeamStripProps) {
  const { t } = useI18n();

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
                    {agentOriginLabel(agent) === "runtime"
                      ? t("teamRun.agent.runtime")
                      : t("teamRun.agent.team")}
                  </span>
                </div>
              </div>
              <div className="agent-team-strip__presence">
                {isLead ? <span className="agent-team-strip__lead">{t("teamRun.agent.lead")}</span> : null}
                <span className="agent-team-strip__status">
                  <span
                    aria-hidden="true"
                    className={`agent-team-strip__status-light agent-team-strip__status-light--${agentStatusTone(agent.status)}`}
                  />
                  {formatAgentStatus(agent.status, t)}
                </span>
              </div>
            </div>
            <div className="agent-team-strip__detail-stack">
              <div className="agent-team-strip__detail">
                <span className="agent-team-strip__detail-label">
                  {t("teamRun.agents.field.responsibility")}
                </span>
                <p>{agent.responsibility || t("teamRun.agent.standingBy")}</p>
              </div>
              <div className="agent-team-strip__detail">
                <span className="agent-team-strip__detail-label">{t("teamRun.agent.currentWork")}</span>
                <p>{workLabel(agent, t)}</p>
              </div>
              <div className="agent-team-strip__detail">
                <span className="agent-team-strip__detail-label">{t("teamRun.agent.latestUpdate")}</span>
                <p>{latestUpdateLabel(events, agent, t)}</p>
              </div>
              <div className="agent-team-strip__detail">
                <span className="agent-team-strip__detail-label">{t("teamRun.agent.toolState")}</span>
                <p>{toolStateLabel(agent, t)}</p>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
