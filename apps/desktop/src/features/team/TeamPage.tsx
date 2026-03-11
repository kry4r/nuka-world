import { useEffect, useMemo, useState } from "react";
import {
  listTeams,
  startTeamRun,
  updateTeam,
  type TeamRecord,
} from "@/lib/team";
import { TeamEditor } from "./TeamEditor";
import { TeamList } from "./TeamList";

function cloneTeam(team: TeamRecord): TeamRecord {
  return {
    ...team,
    agents: team.agents.map((agent) => ({
      ...agent,
      toolBindings: agent.toolBindings.map((binding) => ({ ...binding })),
      toolUsePolicy: { ...agent.toolUsePolicy },
    })),
  };
}

export function TeamPage() {
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [editorTeam, setEditorTeam] = useState<TeamRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void listTeams()
      .then((savedTeams) => {
        if (!alive) {
          return;
        }

        const normalizedTeams = Array.isArray(savedTeams) ? savedTeams : [];
        setTeams(normalizedTeams);
        setSelectedTeamId(normalizedTeams[0]?.id ?? null);
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
  }, []);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [selectedTeamId, teams],
  );

  useEffect(() => {
    if (!selectedTeam) {
      setEditorTeam(null);
      return;
    }

    setEditorTeam(cloneTeam(selectedTeam));
  }, [selectedTeam]);

  const handleToggleTool = (agentId: string, toolId: string, allowed: boolean) => {
    setEditorTeam((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        agents: current.agents.map((agent) =>
          agent.id === agentId
            ? {
                ...agent,
                toolBindings: agent.toolBindings.map((binding) =>
                  binding.toolId === toolId ? { ...binding, allowed } : binding,
                ),
              }
            : agent,
        ),
      };
    });
  };

  const handleSave = async () => {
    if (!editorTeam) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const saved = await updateTeam(editorTeam);
      setTeams((current) =>
        current.map((team) => (team.id === saved.id ? saved : team)),
      );
      setEditorTeam(cloneTeam(saved));
      setNotice("Team saved.");
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartRun = async () => {
    if (!editorTeam) {
      return;
    }

    setIsStartingRun(true);
    setError(null);
    setNotice(null);

    try {
      const run = await startTeamRun(editorTeam.id);
      setNotice(`Run started: ${run.title}`);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
    } finally {
      setIsStartingRun(false);
    }
  };

  return (
    <div className="page-layout team-page">
      <div className="page-layout__body team-page__body">
        <TeamList
          onSelect={setSelectedTeamId}
          selectedTeamId={selectedTeamId}
          teams={teams}
        />

        <TeamEditor
          error={error}
          isSaving={isSaving}
          isStartingRun={isStartingRun}
          notice={notice}
          onSave={() => {
            void handleSave();
          }}
          onStartRun={() => {
            void handleStartRun();
          }}
          onToggleTool={handleToggleTool}
          team={editorTeam}
        />
      </div>
    </div>
  );
}
