import type { TeamAgentRecord } from "@/lib/team";
import {
  humanizeGeneratedAgentDescription,
  humanizeGeneratedAgentRole,
} from "@/lib/agentPresentation";
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
          <span>{humanizeGeneratedAgentRole(agent.role)}</span>
        </div>
        <div className="team-agent-card__policy">
          摘要回填：{agent.toolUsePolicy.summarizeOutput ? "开启" : "关闭"}
        </div>
      </div>

      <p className="team-agent-card__responsibility">
        {humanizeGeneratedAgentDescription(agent.responsibility)}
      </p>

      <TeamToolBindingsPanel
        bindings={agent.toolBindings}
        onToggle={(toolId, allowed) => onToggleTool(agent.id, toolId, allowed)}
      />
    </article>
  );
}
