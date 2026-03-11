import type { TeamAgentRecord } from "@/lib/team";
import { TeamToolBindingsPanel } from "./TeamToolBindingsPanel";

type TeamAgentCardProps = {
  agent: TeamAgentRecord;
  onToggleTool: (agentId: string, toolId: string, allowed: boolean) => void;
};

export function TeamAgentCard({ agent, onToggleTool }: TeamAgentCardProps) {
  return (
    <article className="team-agent-card">
      <div className="team-agent-card__header">
        <div className="team-agent-card__copy">
          <h3>{agent.name}</h3>
          <span>{agent.role}</span>
        </div>
        <div className="team-agent-card__policy">
          Summary backfill: {agent.toolUsePolicy.summarizeOutput ? "On" : "Off"}
        </div>
      </div>

      <p className="team-agent-card__responsibility">{agent.responsibility}</p>

      <TeamToolBindingsPanel
        bindings={agent.toolBindings}
        onToggle={(toolId, allowed) => onToggleTool(agent.id, toolId, allowed)}
      />
    </article>
  );
}
