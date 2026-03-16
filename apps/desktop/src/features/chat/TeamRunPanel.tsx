import { useState } from "react";
import type { TeamRunEventRecord, TeamRunRecord } from "@/lib/team";
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

const VIEW_OPTIONS: Array<{ id: TeamRunPanelView; label: string }> = [
  { id: "conversation", label: "Conversation" },
  { id: "status", label: "Status" },
  { id: "agents", label: "Agents" },
  { id: "files", label: "Files" },
];

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
    return "Waiting for input";
  }

  return titleCase(value);
}

function formatEventKindLabel(kind: string) {
  switch (kind) {
    case "run_started":
      return "Run started";
    case "run_queued":
      return "Queued";
    case "run_blocked":
      return "Blocked";
    case "run_resumed":
      return "Resumed";
    case "run_stuck":
      return "Stuck";
    case "run_retry":
      return "Retry";
    default:
      return titleCase(kind);
  }
}

function latestCheckpointEvent(run: TeamRunRecord) {
  return [...run.events].reverse().find((event) => event.kind === "checkpoint_summary") ?? null;
}

function currentRoundLabel(run: TeamRunRecord) {
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

  return "Awaiting first round";
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

function statusHeadline(value: string) {
  switch (value) {
    case "waiting_for_user":
      return "Needs your follow-up";
    case "queued":
      return "Queued for the next run slot";
    case "blocked":
      return "Blocked until the constraint clears";
    case "stuck":
      return "Needs recovery before the next step";
    case "completed":
    case "done":
      return "Completed the active objective";
    case "running":
      return "Actively working through the round";
    default:
      return formatRunStatus(value);
  }
}

function statusSummary(run: TeamRunRecord) {
  switch (run.status) {
    case "waiting_for_user":
      return "The team has paused after its latest checkpoint and is waiting for your next instruction.";
    case "queued":
      return "The run is staged and will resume automatically when execution capacity is available.";
    case "blocked":
      return "The run cannot move forward until the current blocker is resolved.";
    case "stuck":
      return "The run needs intervention before another retry or resume attempt.";
    case "completed":
    case "done":
      return "The active run finished its current goal and is ready for review or branching.";
    case "running":
      return "The current round is in motion and the active agents are still working.";
    default:
      return run.goal;
  }
}

function nextStepCopy(value: string) {
  switch (value) {
    case "waiting_for_user":
      return "Send the next follow-up from the composer below.";
    case "queued":
      return "Stay on this session until the queue advances.";
    case "blocked":
      return "Resolve the blocker or resume when the dependency clears.";
    case "stuck":
      return "Inspect the latest run state, then retry or resume.";
    case "completed":
    case "done":
      return "Review the result, branch from a checkpoint, or continue with a new instruction.";
    case "running":
      return "Let the active agents finish before steering the next round.";
    default:
      return "Keep the next instruction ready in the composer below.";
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
  const label = status ? formatRunStatus(status) : "Status unknown";
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
  const statusTimeline = statusEvents(run);
  const latestCheckpoint = latestCheckpointEvent(run);

  return (
    <div className="team-run-panel__status-stack">
      <article className="team-run-panel__status-overview ui-card">
        <div className="team-run-panel__status-overview-header">
          <div className="team-run-panel__status-copy">
            <span>Run health</span>
            <strong>{statusHeadline(run.status)}</strong>
          </div>
          <StatusLight status={run.status} />
        </div>
        <p>{statusSummary(run)}</p>
        <div className="team-run-panel__status-metrics">
          <div className="team-run-panel__status-metric">
            <span>Current round</span>
            <strong>{currentRoundLabel(run)}</strong>
          </div>
          <div className="team-run-panel__status-metric">
            <span>Next step</span>
            <strong>{nextStepCopy(run.status)}</strong>
          </div>
        </div>
      </article>

      {latestCheckpoint ? (
        <article className="team-run-panel__status-card ui-card">
          <div className="team-run-panel__status-section-copy">
            <span>Latest checkpoint</span>
            <strong>{latestCheckpoint.title}</strong>
          </div>
          <p>{latestCheckpoint.content}</p>
        </article>
      ) : null}

      {statusTimeline.length > 0 ? (
        <section aria-label="Team run status timeline" className="team-run-panel__status-timeline">
          {statusTimeline.map((event: TeamRunEventRecord) => (
            <article className="team-run-panel__status-item ui-card" key={event.id}>
              <div className="team-run-panel__status-item-header">
                <div className="team-run-panel__status-section-copy">
                  <span>{formatEventKindLabel(event.kind)}</span>
                  <strong>{event.title}</strong>
                </div>
                <StatusLight status={event.status} />
              </div>
              <p>{event.content}</p>
            </article>
          ))}
        </section>
      ) : null}

      <RunCharterCard run={run} />
    </div>
  );
}

function FilesView({ run }: { run: TeamRunRecord }) {
  const fileChangeBatches = groupFileChanges(run);

  if (fileChangeBatches.length === 0) {
    return (
      <section aria-label="File timeline" className="team-run-panel__timeline">
        <article className="team-run-panel__timeline-empty ui-card">
          <strong>File timeline</strong>
          <p>No run artifacts have been written yet.</p>
        </article>
      </section>
    );
  }

  return (
    <section aria-label="File timeline" className="team-run-panel__timeline">
      <div className="team-run-panel__timeline-header">
        <h2>File timeline</h2>
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
  onAddAgent,
  onBranchEvent,
  onContinue,
}: TeamRunPanelProps) {
  const [activeView, setActiveView] = useState<TeamRunPanelView>("conversation");
  const [followUp, setFollowUp] = useState("");
  const [isAddAgentOpen, setIsAddAgentOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentRole, setAgentRole] = useState("");
  const [agentResponsibility, setAgentResponsibility] = useState("");
  const activeViewBody = (() => {
    switch (activeView) {
      case "status":
        return <StatusView run={run} />;
      case "agents":
        return (
          <div className="team-run-panel__agents-view">
            <AgentTeamStrip agents={run.agents} events={run.events} leadAgentId={run.leadAgentId} />
            <section className="team-run-panel__agents-card ui-card">
              <div className="team-run-panel__agents-card-header">
                <div className="team-run-panel__agents-card-copy">
                  <strong>Add another runtime agent when this run needs one.</strong>
                  <span>Keep follow-ups in the footer. Use this only for another active worker.</span>
                </div>
              </div>
              {isAddAgentOpen ? (
                <div className="team-run-panel__agent-form">
                  <label className="team-run-panel__field">
                    <span>Name</span>
                    <input
                      aria-label="Agent name"
                      className="field-input"
                      disabled={isBusy}
                      onChange={(event) => setAgentName(event.target.value)}
                      value={agentName}
                    />
                  </label>
                  <label className="team-run-panel__field">
                    <span>Role</span>
                    <input
                      aria-label="Agent role"
                      className="field-input"
                      disabled={isBusy}
                      onChange={(event) => setAgentRole(event.target.value)}
                      value={agentRole}
                    />
                  </label>
                  <label className="team-run-panel__field">
                    <span>Responsibility</span>
                    <textarea
                      aria-label="Agent responsibility"
                      className="composer__input team-run-panel__input"
                      disabled={isBusy}
                      onChange={(event) => setAgentResponsibility(event.target.value)}
                      rows={2}
                      value={agentResponsibility}
                    />
                  </label>
                </div>
              ) : (
                <p className="team-run-panel__agents-card-note">
                  Keep this session focused. Bring in another runtime agent only when the active
                  team needs extra coverage.
                </p>
              )}
              <div className="team-run-panel__actions">
                {isAddAgentOpen ? (
                  <button
                    className="settings-button"
                    disabled={
                      isBusy ||
                      !agentName.trim() ||
                      !agentRole.trim() ||
                      !agentResponsibility.trim()
                    }
                    onClick={() => {
                      void Promise.resolve(
                        onAddAgent({
                          name: agentName.trim(),
                          role: agentRole.trim(),
                          responsibility: agentResponsibility.trim(),
                        }),
                      ).then(() => {
                        setAgentName("");
                        setAgentRole("");
                        setAgentResponsibility("");
                        setIsAddAgentOpen(false);
                      });
                    }}
                    type="button"
                  >
                    Invite Agent
                  </button>
                ) : null}
                <button
                  className="settings-button"
                  disabled={isBusy}
                  onClick={() => setIsAddAgentOpen((current) => !current)}
                  type="button"
                >
                  {isAddAgentOpen ? "Close Agent Form" : "Add Agent"}
                </button>
              </div>
            </section>
          </div>
        );
      case "files":
        return <FilesView run={run} />;
      case "conversation":
      default:
        return (
          <div className="team-run-panel__conversation-view">
            <AgentTeamStrip agents={run.agents} events={run.events} leadAgentId={run.leadAgentId} />
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
            {VIEW_OPTIONS.map((view) => (
              <button
                aria-selected={activeView === view.id}
                className={`team-run-panel__view-tab${activeView === view.id ? " is-active" : ""}`}
                key={view.id}
                onClick={() => setActiveView(view.id)}
                role="tab"
                type="button"
              >
                {view.label}
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
          <span>Follow-up</span>
          <textarea
            aria-label="Team run follow-up"
            className="composer__input team-run-panel__input"
            disabled={isBusy}
            onChange={(event) => setFollowUp(event.target.value)}
            placeholder="Append instruction"
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
            Continue Run
          </button>
        </div>
      </div>
    </section>
  );
}
