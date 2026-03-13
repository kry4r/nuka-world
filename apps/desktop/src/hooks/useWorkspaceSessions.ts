import { useEffect, useState } from "react";
import {
  listWorkspaceSessions,
  loadWorkspaceSession,
  type WorkspaceSessionDetail,
  type WorkspaceSessionSummary,
} from "@/lib/workspace";

type WorkspaceSelection = {
  id: string;
  kind: WorkspaceSessionSummary["kind"];
};

function sameSelection(
  left: WorkspaceSelection | null,
  right: WorkspaceSelection | null,
) {
  return left?.id === right?.id && left?.kind === right?.kind;
}

export function useWorkspaceSessions() {
  const [sessions, setSessions] = useState<WorkspaceSessionSummary[]>([]);
  const [activeSelection, setActiveSelection] = useState<WorkspaceSelection | null>(null);
  const [activeSession, setActiveSession] = useState<WorkspaceSessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSelection = (nextSelection: WorkspaceSelection | null) => {
    if (!sameSelection(activeSelection, nextSelection)) {
      setActiveSession(null);
    }

    setActiveSelection(nextSelection);
  };

  const refresh = async (preferredSelection?: WorkspaceSelection | null) => {
    setIsLoading(true);
    setError(null);

    try {
      const nextSessions = await listWorkspaceSessions();
      const normalizedSessions = Array.isArray(nextSessions) ? nextSessions : [];
      const preferred =
        preferredSelection ??
        (activeSelection
          ? normalizedSessions.find(
              (session) =>
                session.id === activeSelection.id &&
                session.kind === activeSelection.kind,
            ) ?? null
          : null) ??
        normalizedSessions[0] ??
        null;
      const nextSelection = preferred
        ? { id: preferred.id, kind: preferred.kind }
        : null;

      setSessions(normalizedSessions);

      if (nextSelection && sameSelection(activeSelection, nextSelection)) {
        const nextDetail = await loadWorkspaceSession(nextSelection.id, nextSelection.kind);
        setActiveSession(nextDetail);
        return;
      }

      updateSelection(nextSelection);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    let alive = true;

    if (!activeSelection) {
      setActiveSession(null);
      return () => {
        alive = false;
      };
    }

    setError(null);

    void loadWorkspaceSession(activeSelection.id, activeSelection.kind)
      .then((detail) => {
        if (!alive) {
          return;
        }

        setActiveSession(detail);
      })
      .catch((caughtError) => {
        if (!alive) {
          return;
        }

        const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
        setError(message);
      });

    return () => {
      alive = false;
    };
  }, [activeSelection]);

  const activeSummary =
    activeSelection
      ? sessions.find(
          (session) =>
            session.id === activeSelection.id && session.kind === activeSelection.kind,
        ) ?? null
      : null;

  const setActiveSessionId = (sessionId: string) => {
    const nextSession = sessions.find((session) => session.id === sessionId);
    if (!nextSession) {
      return;
    }

    updateSelection({
      id: nextSession.id,
      kind: nextSession.kind,
    });
  };

  return {
    activeSession,
    activeSessionId: activeSelection?.id ?? null,
    activeSummary,
    error,
    isLoading,
    refresh,
    sessions,
    setActiveSessionId,
  };
}
