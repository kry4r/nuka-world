import { useEffect, useMemo, useState } from "react";
import type { TeamRunAgentRecord, TeamRunEventRecord, TeamRunRecord } from "@/lib/team";
import { useI18n } from "@/lib/i18n";
import { AgentTeamStrip } from "./AgentTeamStrip";
import { RunCharterCard } from "./RunCharterCard";
import { RunEventFeed } from "./RunEventFeed";

export type TeamRunPanelAgentDraft = {
  name: string;
  role: string;
  responsibility: string;
};

type TeamRunPanelProps = {
  run: TeamRunRecord;
  isBusy: boolean;
  onAddAgent: (agent: TeamRunPanelAgentDraft) => Promise<void> | void;
  onBranchEvent?: (eventId: string) => Promise<void> | void;
  onContinue: (prompt: string) => Promise<void> | void;
};

type TeamRunPanelView = "conversation" | "status" | "agents" | "files";

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

  if (value === "queued") {
    return t("teamRun.state.queued");
  }

  if (value === "blocked") {
    return t("teamRun.state.blocked");
  }

  if (value === "stuck") {
    return t("teamRun.state.stuck");
  }

  if (value === "running") {
    return t("teamRun.state.running");
  }

  if (value === "completed" || value === "done") {
    return t("teamRun.state.completed");
  }

  return titleCase(value);
}

function formatEventKindLabel(kind: string, t: ReturnType<typeof useI18n>["t"]) {
  switch (kind) {
    case "run_started":
      return t("teamRun.event.runStarted");
    case "run_queued":
      return t("teamRun.event.queued");
    case "run_blocked":
      return t("teamRun.event.blocked");
    case "run_resumed":
      return t("teamRun.event.resumed");
    case "run_stuck":
      return t("teamRun.event.stuck");
    case "run_retry":
      return t("teamRun.event.retry");
    default:
      return titleCase(kind);
  }
}

function latestCheckpointEvent(run: TeamRunRecord) {
  return [...run.events].reverse().find((event) => event.kind === "checkpoint_summary") ?? null;
}

function currentRoundLabel(run: TeamRunRecord, t: ReturnType<typeof useI18n>["t"]) {
  const sources = [
    latestCheckpointEvent(run)?.title ?? null,
    ...run.events
      .filter((event) => event.kind === "file_change")
      .map((event) => event.title),
  ].filter(Boolean) as string[];

  for (const source of sources) {
    const roundMatch = source.match(/round\s+\d+/i);
    if (roundMatch) {
      return roundMatch[0]
        .split(" ")
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
        .join(" ");
    }
  }

  return t("teamRun.currentRound.awaiting");
}

function statusTone(value: string) {
  switch (value) {
    case "completed":
    case "done":
      return "complete";
    case "blocked":
    case "stuck":
      return "blocked";
    case "queued":
    case "running":
    case "waiting_for_user":
      return "pending";
    default:
      return "neutral";
  }
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

function defaultActiveAgentId(run: TeamRunRecord) {
  return run.agents.find((agent) => agent.id === run.leadAgentId)?.id ?? run.agents[0]?.id ?? null;
}

function sortAgents(agents: TeamRunAgentRecord[], leadAgentId: string | null) {
  return [...agents].sort((left, right) => {
    if (left.id === leadAgentId) {
      return -1;
    }

    if (right.id === leadAgentId) {
      return 1;
    }

    return left.joinedAt.localeCompare(right.joinedAt) || left.name.localeCompare(right.name);
  });
}

function statusHeadline(value: string, t: ReturnType<typeof useI18n>["t"]) {
  switch (value) {
    case "waiting_for_user":
      return t("teamRun.statusView.headline.waitingForUser");
    case "queued":
      return t("teamRun.statusView.headline.queued");
    case "blocked":
      return t("teamRun.statusView.headline.blocked");
    case "stuck":
      return t("teamRun.statusView.headline.stuck");
    case "completed":
    case "done":
      return t("teamRun.statusView.headline.completed");
    case "running":
      return t("teamRun.statusView.headline.running");
    default:
      return formatRunStatus(value, t);
  }
}

function statusSummary(run: TeamRunRecord, t: ReturnType<typeof useI18n>["t"]) {
  switch (run.status) {
    case "waiting_for_user":
      return t("teamRun.statusView.summary.waitingForUser");
    case "queued":
      return t("teamRun.statusView.summary.queued");
    case "blocked":
      return t("teamRun.statusView.summary.blocked");
    case "stuck":
      return t("teamRun.statusView.summary.stuck");
    case "completed":
    case "done":
      return t("teamRun.statusView.summary.completed");
    case "running":
      return t("teamRun.statusView.summary.running");
    default:
      return run.goal;
  }
}

function nextStepCopy(value: string, t: ReturnType<typeof useI18n>["t"]) {
  switch (value) {
    case "waiting_for_user":
      return t("teamRun.statusView.next.waitingForUser");
    case "queued":
      return t("teamRun.statusView.next.queued");
    case "blocked":
      return t("teamRun.statusView.next.blocked");
    case "stuck":
      return t("teamRun.statusView.next.stuck");
    case "completed":
    case "done":
      return t("teamRun.statusView.next.completed");
    case "running":
      return t("teamRun.statusView.next.running");
    default:
      return t("teamRun.statusView.next.default");
  }
}

function groupFileChanges(run: TeamRunRecord) {
  const batches = new Map<
    string,
    { label: string; changes: TeamRunRecord["events"] }
  >();

  for (const event of run.events) {
    if (event.kind !== "file_change") {
      continue;
    }

    const key = event.toolCallId ?? event.title;
    const batch = batches.get(key);
    if (batch) {
      batch.changes.push(event);
      continue;
    }

    batches.set(key, {
      label: event.title,
      changes: [event],
    });
  }

  return Array.from(batches.values());
}

function statusEvents(run: TeamRunRecord) {
  return run.events.filter((event) => event.kind.startsWith("run_"));
}

function StatusLight({ status }: { status: string | null }) {
  const { t } = useI18n();
  const label = status ? formatRunStatus(status, t) : t("teamRun.state.unknown");
  const tone = statusTone(status ?? "unknown");

  return (
    <span
      aria-label={label}
      className={`team-run-panel__status-light team-run-panel__status-light--${tone}`}
      title={label}
    >
      <span className="composer__visually-hidden">{label}</span>
    </span>
  );
}

function StatusView({ run }: { run: TeamRunRecord }) {
  const { t } = useI18n();
  const statusTimeline = statusEvents(run);
  const latestCheckpoint = latestCheckpointEvent(run);

  return (
    <div className="team-run-panel__status-stack">
      <article className="team-run-panel__status-overview ui-card">
        <div className="team-run-panel__status-overview-header">
          <div className="team-run-panel__status-copy">
            <span>{t("teamRun.statusView.health")}</span>
            <strong>{statusHeadline(run.status, t)}</strong>
          </div>
          <StatusLight status={run.status} />
        </div>
        <p>{statusSummary(run, t)}</p>
        <div className="team-run-panel__status-metrics">
          <div className="team-run-panel__status-metric">
            <span>{t("teamRun.statusView.currentRound")}</span>
            <strong>{currentRoundLabel(run, t)}</strong>
          </div>
          <div className="team-run-panel__status-metric">
            <span>{t("teamRun.statusView.nextStep")}</span>
            <strong>{nextStepCopy(run.status, t)}</strong>
          </div>
        </div>
      </article>

      {latestCheckpoint ? (
        <article className="team-run-panel__status-card ui-card">
          <div className="team-run-panel__status-section-copy">
            <span>{t("teamRun.statusView.latestCheckpoint")}</span>
            <strong>{latestCheckpoint.title}</strong>
          </div>
          <p>{latestCheckpoint.content}</p>
        </article>
      ) : null}

      {statusTimeline.length > 0 ? (
        <section
          aria-label={t("teamRun.statusView.timeline")}
          className="team-run-panel__status-timeline"
        >
          {statusTimeline.map((event: TeamRunEventRecord) => (
            <article className="team-run-panel__status-item ui-card" key={event.id}>
              <div className="team-run-panel__status-item-header">
                <div className="team-run-panel__status-section-copy">
                  <span>{formatEventKindLabel(event.kind, t)}</span>
                  <strong>{event.title}</strong>
                </div>
                <StatusLight status={event.status} />
              </div>
              <p>{event.content}</p>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function FilesView({ run }: { run: TeamRunRecord }) {
  const { t } = useI18n();
  const fileChangeBatches = groupFileChanges(run);

  if (fileChangeBatches.length === 0) {
    return (
      <section aria-label={t("teamRun.files.title")} className="team-run-panel__timeline">
        <article className="team-run-panel__timeline-empty ui-card">
          <strong>{t("teamRun.files.title")}</strong>
          <p>{t("teamRun.files.empty")}</p>
        </article>
      </section>
    );
  }

  return (
    <section aria-label={t("teamRun.files.title")} className="team-run-panel__timeline">
      <div className="team-run-panel__timeline-header">
        <h2>{t("teamRun.files.title")}</h2>
      </div>
      <div className="team-run-panel__timeline-groups">
        {fileChangeBatches.map((batch) => (
          <article className="team-run-panel__timeline-group ui-card" key={batch.label}>
            <h3>{batch.label}</h3>
            <ul className="team-run-panel__timeline-list">
              {batch.changes.map((change) => (
                <li className="team-run-panel__timeline-item" key={change.id}>
                  <span className="team-run-panel__timeline-file">{change.content}</span>
                  <span className="team-run-panel__timeline-kind">{change.status}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

export function TeamRunPanel({
  run,
  isBusy,
  onBranchEvent,
  onContinue,
}: TeamRunPanelProps) {
  const { t } = useI18n();
  const [activeView, setActiveView] = useState<TeamRunPanelView>("conversation");
  const [activeAgentId, setActiveAgentId] = useState<string | null>(() => defaultActiveAgentId(run));
  const [followUp, setFollowUp] = useState("");
  const sortedAgents = useMemo(
    () => sortAgents(run.agents, run.leadAgentId),
    [run.agents, run.leadAgentId],
  );
  const agentIdsKey = useMemo(() => sortedAgents.map((agent) => agent.id).join("|"), [sortedAgents]);
  const activeAgent = sortedAgents.find((agent) => agent.id === activeAgentId) ?? sortedAgents[0] ?? null;

  useEffect(() => {
    setActiveAgentId((current) => {
      if (current && sortedAgents.some((agent) => agent.id === current)) {
        return current;
      }

      return sortedAgents.find((agent) => agent.id === run.leadAgentId)?.id ?? sortedAgents[0]?.id ?? null;
    });
  }, [agentIdsKey, run.leadAgentId, sortedAgents]);

  const activeViewBody = (() => {
    switch (activeView) {
      case "status":
        return <StatusView run={run} />;
      case "agents":
        return (
          <div className="team-run-panel__agents-layout">
            <AgentTeamStrip
              agents={sortedAgents}
              events={run.events}
              leadAgentId={run.leadAgentId}
              onSelectAgent={setActiveAgentId}
              selectedAgentId={activeAgent?.id ?? null}
            />
            <section className="team-run-panel__agent-timeline ui-card">
              {activeAgent ? (
                <>
                  <header className="team-run-panel__agent-timeline-header">
                    <div className="team-run-panel__agent-timeline-copy">
                      <div className="team-run-panel__agent-timeline-identity">
                        <span aria-hidden="true" className="team-run-panel__agent-avatar" />
                        <strong>{activeAgent.name}</strong>
                        <span>{activeAgent.role}</span>
                      </div>
                      <p>{activeAgent.currentWork || activeAgent.responsibility || t("teamRun.agent.standingBy")}</p>
                    </div>
                    <span className="team-run-panel__agent-status">
                      <span
                        aria-hidden="true"
                        className={`agent-team-strip__status-light agent-team-strip__status-light--${statusTone(activeAgent.status)}`}
                      />
                      {formatAgentStatus(activeAgent.status, t)}
                    </span>
                  </header>
                  <div className="team-run-panel__agent-timeline-scroll">
                    <RunEventFeed
                      agents={run.agents}
                      events={run.events}
                      mode="agent"
                      onBranch={onBranchEvent}
                      selectedAgentId={activeAgent.id}
                    />
                  </div>
                </>
              ) : (
                <div className="team-run-panel__timeline-empty">
                  <strong>{t("teamRun.view.agents")}</strong>
                  <p>{t("teamRun.agent.noSessionUpdate")}</p>
                </div>
              )}
            </section>
          </div>
        );
      case "files":
        return <FilesView run={run} />;
      case "conversation":
      default:
        return (
          <div className="team-run-panel__conversation-view">
            <RunCharterCard run={run} />
            <RunEventFeed agents={run.agents} events={run.events} onBranch={onBranchEvent} />
          </div>
        );
    }
  })();

  return (
    <section aria-label="Team run session" className="team-run-panel">
      <div className="team-run-panel__views ui-card">
        <div className="team-run-panel__views-header">
          <div className="team-run-panel__view-tabs" role="tablist">
            {(["conversation", "status", "agents", "files"] as TeamRunPanelView[]).map((view) => (
              <button
                aria-selected={activeView === view}
                className={`team-run-panel__view-tab${activeView === view ? " is-active" : ""}`}
                key={view}
                onClick={() => setActiveView(view)}
                role="tab"
                type="button"
              >
                {t(`teamRun.view.${view}` as const)}
              </button>
            ))}
          </div>
        </div>

        <div className="team-run-panel__view-body">
          <div className="team-run-panel__view-scroll">{activeViewBody}</div>
        </div>
      </div>

      <div className="team-run-panel__composer ui-card">
        <label className="team-run-panel__field">
          <span>{t("teamRun.composer.followUp")}</span>
          <textarea
            aria-label={t("teamRun.composer.followUp")}
            className="composer__input team-run-panel__input"
            disabled={isBusy}
            onChange={(event) => setFollowUp(event.target.value)}
            placeholder={t("teamRun.composer.placeholder")}
            rows={1}
            value={followUp}
          />
        </label>

        <div className="team-run-panel__actions">
          <button
            className="settings-button settings-button--accent"
            disabled={isBusy || !followUp.trim()}
            onClick={() => {
              const nextPrompt = followUp.trim();
              if (!nextPrompt) {
                return;
              }

              void Promise.resolve(onContinue(nextPrompt)).then(() => {
                setFollowUp("");
              });
            }}
            type="button"
          >
            {t("teamRun.composer.continue")}
          </button>
        </div>
      </div>
    </section>
  );
}
