import type { TeamRunAgentRecord, TeamRunEventRecord } from "@/lib/team";

type RunEventFeedProps = {
  agents: TeamRunAgentRecord[];
  events: TeamRunEventRecord[];
  onBranch?: (eventId: string) => void;
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

export function RunEventFeed({ agents, events, onBranch }: RunEventFeedProps) {
  const visibleEvents = events.filter((event) => event.kind !== "file_change");

  return (
    <section aria-label="Run event feed" className="run-event-feed">
      {visibleEvents.map((event) => (
        <article className="run-event-feed__item" key={event.id}>
          <div className="run-event-feed__meta-row">
            <div className="run-event-feed__meta">
              <span className="run-event-feed__kind">{event.kind}</span>
              <span className="run-event-feed__agent">{agentName(agents, event.agentId)}</span>
            </div>
            {onBranch ? (
              <button
                aria-label="Branch from this event"
                className="run-event-feed__branch"
                onClick={() => onBranch(event.id)}
                type="button"
              >
                Branch
              </button>
            ) : null}
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
