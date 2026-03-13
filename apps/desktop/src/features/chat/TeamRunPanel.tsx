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
  error: string | null;
  isBusy: boolean;
  onAddAgent: (agent: TeamRunPanelAgentDraft) => Promise<void> | void;
  onBranchEvent?: (eventId: string) => Promise<void> | void;
  onContinue: (prompt: string) => Promise<void> | void;
};

export function TeamRunPanel({
  run,
  error,
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

  return (
    <section aria-label="Team run session" className="team-run-panel">
      <AgentTeamStrip agents={run.agents} leadAgentId={run.leadAgentId} />
      <RunCharterCard run={run} />
      <RunEventFeed agents={run.agents} events={run.events} onBranch={onBranchEvent} />

      <div className="team-run-panel__composer ui-card">
        {error ? <div className="team-run-panel__error">{error}</div> : null}

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
