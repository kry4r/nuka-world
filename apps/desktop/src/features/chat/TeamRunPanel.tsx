import { useState } from "react";
import type { TeamRunRecord } from "@/lib/team";
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

export function TeamRunPanel({
  run,
  isBusy,
  onAddAgent,
  onBranchEvent,
  onContinue,
}: TeamRunPanelProps) {
  const [followUp, setFollowUp] = useState("");
  const [isAddAgentOpen, setIsAddAgentOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentRole, setAgentRole] = useState("");
  const [agentResponsibility, setAgentResponsibility] = useState("");
  const fileChangeBatches = groupFileChanges(run);

  return (
    <section aria-label="Team run session" className="team-run-panel">
      <AgentTeamStrip agents={run.agents} leadAgentId={run.leadAgentId} />
      <RunCharterCard run={run} />
      <RunEventFeed agents={run.agents} events={run.events} onBranch={onBranchEvent} />
      {fileChangeBatches.length > 0 ? (
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
      ) : null}

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
        ) : null}

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
