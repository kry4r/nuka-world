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
    { id: string; label: string; changes: TeamRunRecord["events"]; latestSequence: number }
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
      id: key,
      label: event.title,
      changes: [event],
      latestSequence: event.sequence,
    });
  }

  return Array.from(batches.values())
    .map((batch) => ({
      ...batch,
      changes: [...batch.changes].sort((left, right) => right.sequence - left.sequence),
    }))
    .sort((left, right) => right.latestSequence - left.latestSequence);
}

function statusEvents(run: TeamRunRecord) {
  return run.events.filter((event) => event.kind.startsWith("run_"));
}

function filePath(event: TeamRunEventRecord) {
  return (event.toolTarget ?? event.content).replace(/\\/g, "/");
}

function fileName(event: TeamRunEventRecord) {
  const normalizedPath = filePath(event);
  const segments = normalizedPath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? event.content;
}

function fileChangeMarker(status: string | null) {
  switch (status) {
    case "created":
      return "A";
    case "modified":
    case "updated":
      return "M";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    default:
      return (status ?? "?").slice(0, 1).toUpperCase();
  }
}

function fileChangeStatusLabel(status: string | null, t: ReturnType<typeof useI18n>["t"]) {
  switch (status) {
    case "created":
      return t("teamRun.files.status.created");
    case "modified":
    case "updated":
      return t("teamRun.files.status.modified");
    case "deleted":
      return t("teamRun.files.status.deleted");
    case "renamed":
      return t("teamRun.files.status.renamed");
    default:
      return status ? titleCase(status) : t("teamRun.state.unknown");
  }
}

function fileChangeTone(status: string | null) {
  switch (status) {
    case "created":
      return "added";
    case "modified":
    case "updated":
      return "modified";
    case "deleted":
      return "deleted";
    case "renamed":
      return "renamed";
    default:
      return "neutral";
  }
}

function eventAgentLabel(
  event: TeamRunEventRecord,
  run: TeamRunRecord,
  t: ReturnType<typeof useI18n>["t"],
) {
  return run.agents.find((agent) => agent.id === event.agentId)?.name ?? t("teamRun.speaker.system");
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
  const fileChangeBatches = useMemo(() => groupFileChanges(run), [run]);
  const batchIdsKey = useMemo(
    () => fileChangeBatches.map((batch) => `${batch.id}:${batch.changes.length}`).join("|"),
    [fileChangeBatches],
  );
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({});
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedBatches((current) => {
      const next: Record<string, boolean> = {};
      fileChangeBatches.forEach((batch, index) => {
        next[batch.id] = current[batch.id] ?? index === 0;
      });
      return next;
    });
  }, [batchIdsKey, fileChangeBatches]);

  useEffect(() => {
    const allChanges = fileChangeBatches.flatMap((batch) => batch.changes);
    setSelectedFileId((current) =>
      current && allChanges.some((change) => change.id === current)
        ? current
        : allChanges[0]?.id ?? null,
    );
  }, [batchIdsKey, fileChangeBatches]);

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

  const selectedBatch =
    fileChangeBatches.find((batch) => batch.changes.some((change) => change.id === selectedFileId)) ??
    fileChangeBatches[0];
  const selectedFile =
    selectedBatch?.changes.find((change) => change.id === selectedFileId) ??
    selectedBatch?.changes[0] ??
    null;

  return (
    <section aria-label={t("teamRun.files.title")} className="team-run-panel__timeline">
      <div className="team-run-panel__files-layout">
        <aside className="team-run-panel__files-tree">
          <div className="team-run-panel__files-pane-header">
            <h2>{t("teamRun.files.title")}</h2>
          </div>
          <div className="team-run-panel__files-groups">
            {fileChangeBatches.map((batch) => (
              <section className="team-run-panel__file-group" key={batch.id}>
                <button
                  aria-expanded={expandedBatches[batch.id] ?? false}
                  className="team-run-panel__file-group-toggle"
                  onClick={() =>
                    setExpandedBatches((current) => ({
                      ...current,
                      [batch.id]: !current[batch.id],
                    }))
                  }
                  type="button"
                >
                  <strong>{batch.label}</strong>
                  <span>{t("teamRun.files.count", { count: batch.changes.length })}</span>
                </button>
                {expandedBatches[batch.id] ? (
                  <div className="team-run-panel__file-group-list">
                    {batch.changes.map((change) => (
                      <button
                        aria-pressed={selectedFile?.id === change.id}
                        className={`team-run-panel__file-row${selectedFile?.id === change.id ? " is-selected" : ""}`}
                        key={change.id}
                        onClick={() => setSelectedFileId(change.id)}
                        type="button"
                      >
                        <span
                          className={`team-run-panel__file-marker team-run-panel__file-marker--${fileChangeTone(change.status)}`}
                        >
                          {fileChangeMarker(change.status)}
                        </span>
                        <span className="team-run-panel__file-copy">
                          <strong>{fileName(change)}</strong>
                          <span>{filePath(change)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </aside>

        <section className="team-run-panel__file-preview ui-card">
          {selectedFile ? (
            <>
              <div className="team-run-panel__files-pane-header">
                <h2>{t("teamRun.files.preview")}</h2>
              </div>
              <div className="team-run-panel__file-preview-header">
                <div className="team-run-panel__file-preview-copy">
                  <strong>{fileName(selectedFile)}</strong>
                  <span>{filePath(selectedFile)}</span>
                </div>
                <span
                  className={`team-run-panel__file-status team-run-panel__file-status--${fileChangeTone(selectedFile.status)}`}
                >
                  {fileChangeStatusLabel(selectedFile.status, t)}
                </span>
              </div>
              <dl className="team-run-panel__file-preview-meta">
                <div>
                  <dt>{t("teamRun.files.batch")}</dt>
                  <dd>{selectedBatch?.label ?? t("teamRun.files.title")}</dd>
                </div>
                <div>
                  <dt>{t("teamRun.files.changedBy")}</dt>
                  <dd>{eventAgentLabel(selectedFile, run, t)}</dd>
                </div>
                <div>
                  <dt>{t("teamRun.files.changeType")}</dt>
                  <dd>{fileChangeStatusLabel(selectedFile.status, t)}</dd>
                </div>
                <div>
                  <dt>{t("teamRun.files.path")}</dt>
                  <dd>{filePath(selectedFile)}</dd>
                </div>
              </dl>
              <article className="team-run-panel__file-preview-fallback">
                <strong>{t("teamRun.files.previewFallbackTitle")}</strong>
                <p>{t("teamRun.files.previewFallback")}</p>
              </article>
            </>
          ) : null}
        </section>
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
