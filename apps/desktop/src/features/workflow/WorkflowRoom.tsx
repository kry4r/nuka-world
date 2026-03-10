import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import type { WorkflowEvent, WorkflowSessionResponse } from "@/lib/workflow";
import { WorkflowTimeline } from "./WorkflowTimeline";

type WorkflowRoomProps = {
  session: WorkflowSessionResponse;
  workflowTitle: string;
  prompt: string;
  isContinuing: boolean;
  composerDisabled: boolean;
  continueDisabled: boolean;
  onContinue: () => void;
  onPromptChange: (value: string) => void;
  reviewDock?: ReactNode;
};

export function WorkflowRoom({
  composerDisabled,
  continueDisabled,
  isContinuing,
  onContinue,
  onPromptChange,
  prompt,
  reviewDock,
  session,
  workflowTitle,
}: WorkflowRoomProps) {
  const transcriptEvents = session.events.filter(isTranscriptEvent);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <Card
        description={`${workflowTitle} | Session ${session.sessionId.slice(0, 8)}...`}
        title="Workflow Room"
        tone="accent"
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            marginTop: "1rem",
          }}
        >
          <div
            style={{
              padding: "0.7rem 0.9rem",
              borderRadius: "999px",
              border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
              background: "var(--surface-raised, rgba(10, 16, 24, 0.62))",
            }}
          >
            Status: {session.status}
          </div>
          <div
            style={{
              padding: "0.7rem 0.9rem",
              borderRadius: "999px",
              border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
              background: "var(--surface-raised, rgba(10, 16, 24, 0.62))",
            }}
          >
            {transcriptEvents.length} transcript events
          </div>
        </div>
      </Card>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
          gap: "1rem",
        }}
      >
        <Card title="Transcript" tone="soft">
          <div style={{ display: "grid", gap: "0.85rem" }}>
            {transcriptEvents.map((event) => (
              <article
                key={event.id}
                style={{
                  display: "grid",
                  gap: "0.45rem",
                  padding: "1rem 1.05rem",
                  borderRadius: "1.1rem",
                  border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
                  background:
                    event.kind === "assistant_message"
                      ? "var(--surface-raised, rgba(10, 16, 24, 0.68))"
                      : "var(--surface-raised, rgba(10, 16, 24, 0.52))",
                }}
              >
                <strong style={{ textTransform: "capitalize" }}>
                  {event.kind === "assistant_message" ? "Workflow" : "You"}
                </strong>
                <p style={{ margin: 0 }}>{event.content}</p>
              </article>
            ))}
          </div>
        </Card>

        <WorkflowTimeline events={session.events} />
      </div>

      <Card
        description="Continue the active workflow room with a follow-up instruction."
        title="Continue Workflow"
        tone="soft"
      >
        <div style={{ display: "grid", gap: "0.85rem" }}>
          {reviewDock}
          <textarea
            className="settings-input"
            disabled={composerDisabled}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="Message this workflow room..."
            rows={4}
            value={prompt}
          />
          <div className="settings-panel__footer">
            <button
              className="settings-button settings-button--accent"
              disabled={continueDisabled}
              onClick={onContinue}
              type="button"
            >
              {isContinuing ? "Continuing..." : "Continue Workflow"}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function isTranscriptEvent(
  event: WorkflowEvent,
): event is Extract<WorkflowEvent, { kind: "user_message" | "assistant_message" }> {
  return event.kind === "user_message" || event.kind === "assistant_message";
}
