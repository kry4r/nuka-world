import type { WorkspaceSessionSummary } from "@/lib/workspace";

type SessionTabsProps = {
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  sessions: WorkspaceSessionSummary[];
};

function kindLabel(kind: WorkspaceSessionSummary["kind"]) {
  return kind === "team_run" ? "Team Run" : "Chat";
}

export function SessionTabs({
  activeSessionId,
  onSelect,
  sessions,
}: SessionTabsProps) {
  if (sessions.length === 0) {
    return null;
  }

  return (
    <div aria-label="Workspace sessions" className="session-tabs" role="tablist">
      {sessions.map((session) => {
        const active = session.id === activeSessionId;

        return (
          <button
            aria-selected={active}
            className={`session-tab${active ? " is-active" : ""}`}
            key={`${session.kind}:${session.id}`}
            onClick={() => onSelect(session.id)}
            role="tab"
            type="button"
          >
            <span className="session-tab__kind">{kindLabel(session.kind)}</span>
            <span className="session-tab__title">{session.title}</span>
          </button>
        );
      })}
    </div>
  );
}
