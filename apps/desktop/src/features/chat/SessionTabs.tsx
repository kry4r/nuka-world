import type { WorkspaceSessionSummary } from "@/lib/workspace";

type SessionTabsProps = {
  activeSessionId: string | null;
  onClose: (sessionId: string, kind: WorkspaceSessionSummary["kind"]) => void;
  onSelect: (sessionId: string) => void;
  sessions: WorkspaceSessionSummary[];
};

function kindLabel(kind: WorkspaceSessionSummary["kind"]) {
  return kind === "team_run" ? "Team Run" : "Chat";
}

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
      className="session-tabs session-tabs--scrollable"
      role="tablist"
    >
      {sessions.map((session) => {
        const active = session.id === activeSessionId;
        const branch = Boolean(session.lineage);

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
              type="button"
            >
              <span className="session-tab__meta">
                <span className="session-tab__kind">{kindLabel(session.kind)}</span>
                {branch ? <span className="session-tab__branch">Branch</span> : null}
              </span>
              <span className="session-tab__title">{session.title}</span>
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
