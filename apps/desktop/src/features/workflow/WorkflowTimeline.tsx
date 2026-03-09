import { Card } from "@/components/ui/Card";
import type { WorkflowEvent } from "@/lib/workflow";

type WorkflowTimelineProps = {
  events: WorkflowEvent[];
};

export function WorkflowTimeline({ events }: WorkflowTimelineProps) {
  const timelineEvents = events.filter(isNodeEvent);

  return (
    <Card title="Timeline" tone="soft">
      <div style={{ display: "grid", gap: "0.85rem" }}>
        {timelineEvents.length > 0 ? (
          timelineEvents.map((event) => (
            <article
              key={event.id}
              style={{
                display: "grid",
                gap: "0.45rem",
                padding: "1rem 1.05rem",
                borderRadius: "1.1rem",
                border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
                background: "var(--surface-raised, rgba(10, 16, 24, 0.62))",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                }}
              >
                <strong>{event.title}</strong>
                <span
                  style={{
                    fontSize: "0.7rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-muted, rgba(255, 255, 255, 0.64))",
                  }}
                >
                  {event.status}
                </span>
              </div>
              {event.detail ? (
                <p style={{ margin: 0, color: "var(--text-muted, rgba(255, 255, 255, 0.72))" }}>{event.detail}</p>
              ) : null}
            </article>
          ))
        ) : (
          <p style={{ margin: 0, color: "var(--text-muted, rgba(255, 255, 255, 0.72))" }}>
            Timeline events will appear as the workflow advances.
          </p>
        )}
      </div>
    </Card>
  );
}

function isNodeEvent(event: WorkflowEvent): event is Extract<WorkflowEvent, { kind: "node_event" }> {
  return event.kind === "node_event";
}
