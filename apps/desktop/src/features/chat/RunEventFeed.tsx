import type { TeamRunAgentRecord, TeamRunEventRecord } from "@/lib/team";

type RunEventFeedProps = {
  agents: TeamRunAgentRecord[];
  events: TeamRunEventRecord[];
};

function agentName(
  agents: TeamRunAgentRecord[],
  agentId: string | null,
) {
  if (!agentId) {
    return "Coordinator";
  }

  return agents.find((agent) => agent.id === agentId)?.name ?? "Agent";
}

export function RunEventFeed({ agents, events }: RunEventFeedProps) {
  return (
    <section aria-label="Run event feed" className="run-event-feed">
      {events.map((event) => (
        <article className="run-event-feed__item" key={event.id}>
          <div className="run-event-feed__meta">
            <span className="run-event-feed__kind">{event.kind}</span>
            <span className="run-event-feed__agent">{agentName(agents, event.agentId)}</span>
          </div>
          <h3>{event.title}</h3>
          <p>{event.content}</p>
          {event.toolName ? (
            <div className="run-event-feed__tool">
              <span>{event.toolName}</span>
              {event.toolTarget ? <span>{event.toolTarget}</span> : null}
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
