import type { WorkspaceSessionSummary } from "@/lib/workspace";

type SessionTabsProps = {
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  sessions: WorkspaceSessionSummary[];
};

function kindLabel(kind: WorkspaceSessionSummary["kind"]) {
  return kind === "team_run" ? "Team Run" : "Chat";
}

function branchLabel(session: WorkspaceSessionSummary) {
  const depth = session.lineage?.branchDepth ?? 0;
  if (depth === 0) {
    return null;
  }

  return `Branch ${depth}`;
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
    <div
      aria-label="Workspace sessions"
      className="session-tabs session-tabs--uniform"
      role="tablist"
    >
      {sessions.map((session) => {
        const active = session.id === activeSessionId;

        return (
          <button
            aria-selected={active}
            className={`session-tab session-tab--uniform${active ? " is-active" : ""}`}
            key={`${session.kind}:${session.id}`}
            onClick={() => onSelect(session.id)}
            role="tab"
            type="button"
          >
            <span className="session-tab__kind">{kindLabel(session.kind)}</span>
            {branchLabel(session) ? (
              <span className="session-tab__kind">{branchLabel(session)}</span>
            ) : null}
            <span className="session-tab__title">{session.title}</span>
          </button>
        );
      })}
    </div>
  );
}
