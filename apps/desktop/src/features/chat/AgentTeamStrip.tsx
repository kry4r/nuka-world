import type { TeamRunAgentRecord, TeamRunEventRecord } from "@/lib/team";
import { useI18n } from "@/lib/i18n";

type AgentTeamStripProps = {
  agents: TeamRunAgentRecord[];
  events: TeamRunEventRecord[];
  leadAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  selectedAgentId: string | null;
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

export function AgentTeamStrip({
  agents,
  events,
  leadAgentId,
  onSelectAgent,
  selectedAgentId,
}: AgentTeamStripProps) {
  const { t } = useI18n();

  return (
    <section aria-label="Agent team strip" className="agent-team-strip">
      {agents.map((agent) => {
        const isLead = agent.id === leadAgentId;
        const isSelected = agent.id === selectedAgentId;

        return (
          <button
            aria-label={agent.name}
            aria-pressed={isSelected}
            className={`agent-team-strip__item${isLead ? " is-lead" : ""}${isSelected ? " is-selected" : ""}`}
            data-lead={isLead}
            key={agent.id}
            onClick={() => onSelectAgent(agent.id)}
            type="button"
          >
            <div className="agent-team-strip__item-top">
              <div className="agent-team-strip__identity-line">
                <span aria-hidden="true" className="agent-team-strip__avatar" />
                <div className="agent-team-strip__identity">
                  <strong>{agent.name}</strong>
                  <span>{agent.role}</span>
                </div>
              </div>
            </div>
            <p className="agent-team-strip__summary">
              {latestUpdateLabel(events, agent, t) || workLabel(agent, t)}
            </p>
            <div className="agent-team-strip__presence">
              <span className="agent-team-strip__status">
                <span
                  aria-hidden="true"
                  className={`agent-team-strip__status-light agent-team-strip__status-light--${agentStatusTone(agent.status)}`}
                />
                {formatAgentStatus(agent.status, t)}
              </span>
              <span className="agent-team-strip__origin">
                {agentOriginLabel(agent) === "runtime"
                  ? t("teamRun.agent.runtime")
                  : t("teamRun.agent.team")}
              </span>
            </div>
          </button>
        );
      })}
    </section>
  );
}
