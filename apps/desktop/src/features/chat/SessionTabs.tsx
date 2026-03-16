import { useState } from "react";
import type { WorkspaceSessionSummary } from "@/lib/workspace";

type SessionTabsProps = {
  activeSessionId: string | null;
  onClose: (sessionId: string, kind: WorkspaceSessionSummary["kind"]) => void;
  onSelect: (sessionId: string) => void;
  sessions: WorkspaceSessionSummary[];
};

export function SessionTabs({
  activeSessionId,
  onClose,
  onSelect,
  sessions,
}: SessionTabsProps) {
  const [revealedSessionKey, setRevealedSessionKey] = useState<string | null>(null);

  if (sessions.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Workspace sessions"
      className="session-tabs session-tabs--scrollable session-tabs--browser session-tabs--dense"
      role="tablist"
      style={{ maxWidth: "100%", overflowY: "hidden", width: "100%" }}
    >
      {sessions.map((session) => {
        const sessionKey = `${session.kind}:${session.id}`;
        const active = session.id === activeSessionId;
        const markers = [
          session.kind === "team_run" ? "Run" : null,
          session.lineage ? "Branch" : null,
        ].filter(Boolean) as string[];

        return (
          <div
            className={`session-tab-shell${active ? " is-active" : ""}${revealedSessionKey === sessionKey ? " is-revealed" : ""}`}
            key={sessionKey}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
                return;
              }

              setRevealedSessionKey((current) => (current === sessionKey ? null : current));
            }}
            onFocus={() => setRevealedSessionKey(sessionKey)}
            onMouseEnter={() => setRevealedSessionKey(sessionKey)}
            onMouseLeave={() =>
              setRevealedSessionKey((current) => (current === sessionKey ? null : current))
            }
          >
            <button
              aria-selected={active}
              className={`session-tab session-tab--compact${active ? " is-active" : ""}`}
              onClick={() => onSelect(session.id)}
              role="tab"
              title={session.title}
              type="button"
            >
              <span className="session-tab__content">
                <span className="session-tab__title">{session.title}</span>
                {markers.length > 0 ? (
                  <span className="session-tab__markers">
                    {markers.map((marker) => (
                      <span
                        className={`session-tab__marker session-tab__marker--${marker.toLowerCase().replace(/\s+/g, "-")}`}
                        key={`${session.id}-${marker}`}
                      >
                        {marker}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            </button>
            <button
              aria-label={`Close session ${session.title}`}
              className="session-tab__close"
              onClick={(event) => {
                event.stopPropagation();
                onClose(session.id, session.kind);
              }}
              type="button"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
