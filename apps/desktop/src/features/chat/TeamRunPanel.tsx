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

function StatusView({ run }: { run: TeamRunRecord }) {
  const statusTimeline = statusEvents(run);

  return (
    <div className="team-run-panel__status-stack">
      <article className="team-run-panel__status-card ui-card">
        <div className="team-run-panel__status-header">
          <div className="team-run-panel__status-copy">
            <span>Run status</span>
            <strong>{formatRunStatus(run.status)}</strong>
          </div>
          <span className="status-badge status-badge--soft">{titleCase(run.currentPhase)}</span>
        </div>
        <p>{run.goal}</p>
      </article>

      {statusTimeline.length > 0 ? (
        <section aria-label="Team run status timeline" className="team-run-panel__status-timeline">
          {statusTimeline.map((event: TeamRunEventRecord) => (
            <article className="team-run-panel__status-item ui-card" key={event.id}>
              <div className="team-run-panel__status-item-header">
                <strong>{event.title}</strong>
                {event.status ? (
                  <span className="status-badge status-badge--soft">
                    {formatRunStatus(event.status)}
                  </span>
                ) : null}
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
            <AgentTeamStrip agents={run.agents} leadAgentId={run.leadAgentId} />
            <section className="team-run-panel__agents-card ui-card">
              <div className="team-run-panel__agents-card-header">
                <div className="team-run-panel__agents-card-copy">
                  <span>Runtime agents</span>
                  <strong>Invite another worker when this run needs one.</strong>
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
                  Keep the footer focused on follow-up instructions. Add runtime agents only
                  when the session needs another active worker.
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
            <AgentTeamStrip agents={run.agents} leadAgentId={run.leadAgentId} />
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
