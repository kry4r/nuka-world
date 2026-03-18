import type { TeamRunAgentRecord, TeamRunEventRecord } from "@/lib/team";
import { useI18n } from "@/lib/i18n";
import {
  latestCompactionAgentEntry,
  humanizeTeamRunAgentRole,
  humanizeTeamRunProtocolCopy,
  humanizeTeamRunWork,
  titleCase,
} from "./teamRunPresentation";

type AgentTeamStripProps = {
  agents: TeamRunAgentRecord[];
  events: TeamRunEventRecord[];
  leadAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  selectedAgentId: string | null;
};

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

function workLabel(
  agent: TeamRunAgentRecord,
  t: ReturnType<typeof useI18n>["t"],
) {
  return (
    humanizeTeamRunWork(agent.currentWork, t) ||
    humanizeActivityLabel(agent.lastToolActivity, t) ||
    t("teamRun.agent.standingBy")
  );
}

function latestAgentEvent(events: TeamRunEventRecord[], agentId: string) {
  return (
    [...events]
      .reverse()
      .find(
        (event) => event.agentId === agentId && event.kind !== "file_change",
      ) ?? null
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
    const compactionEntry = latestCompactionAgentEntry(events, agent.name);
    return compactionEntry?.title ?? workLabel(agent, t);
  }

  return event.title;
}

function truncatePreview(value: string, maxLength = 84) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function latestUpdateExcerpt(
  events: TeamRunEventRecord[],
  agent: TeamRunAgentRecord,
  t: ReturnType<typeof useI18n>["t"],
) {
  const event = latestAgentEvent(events, agent.id);
  if (event) {
    const source =
      event.kind === "file_change" && event.toolTarget
        ? event.toolTarget
        : event.content;
    return truncatePreview(humanizeTeamRunProtocolCopy(source, t));
  }

  const compactionEntry = latestCompactionAgentEntry(events, agent.name);
  if (compactionEntry?.content) {
    return truncatePreview(humanizeTeamRunProtocolCopy(compactionEntry.content, t));
  }

  return null;
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
        const excerpt = latestUpdateExcerpt(events, agent, t);

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
                  <span>
                    {humanizeTeamRunAgentRole(agent.role, t) ?? agent.role}
                  </span>
                </div>
              </div>
            </div>
            <p className="agent-team-strip__summary">
              {latestUpdateLabel(events, agent, t) || workLabel(agent, t)}
            </p>
            {excerpt ? <p className="agent-team-strip__excerpt">{excerpt}</p> : null}
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
