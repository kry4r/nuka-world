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
  if (sessions.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Workspace sessions"
      className="session-tabs session-tabs--scrollable session-tabs--browser"
      role="tablist"
    >
      {sessions.map((session) => {
        const active = session.id === activeSessionId;
        const markers = [
          session.kind === "team_run" ? "Run" : null,
          session.lineage ? "Branch" : null,
        ].filter(Boolean) as string[];

        return (
          <div
            className={`session-tab-shell${active ? " is-active" : ""}`}
            key={`${session.kind}:${session.id}`}
          >
            <button
              aria-selected={active}
              className={`session-tab session-tab--compact${active ? " is-active" : ""}`}
              onClick={() => onSelect(session.id)}
              role="tab"
              title={session.title}
              type="button"
            >
              <span className="session-tab__title-row">
                <span className="session-tab__title">{session.title}</span>
                {markers.map((marker) => (
                  <span
                    className={`session-tab__marker session-tab__marker--${marker.toLowerCase().replace(/\s+/g, "-")}`}
                    key={`${session.id}-${marker}`}
                  >
                    {marker}
                  </span>
                ))}
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
