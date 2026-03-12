import { useEffect, useMemo, useState } from "react";
import { listAgents, type AgentRecord } from "@/lib/agents";
import {
  listTeams,
  startTeamRun,
  updateTeam,
  type TeamRecord,
  type TeamAgentAssignmentRecord,
  type TeamAgentRecord,
  type ToolBindingRecord,
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
    agentAssignments: team.agentAssignments.map((assignment) => ({ ...assignment })),
  };
}

function inferAdapterKind(toolId: string) {
  if (toolId.startsWith("mcp:")) {
    return "mcp";
  }

  if (toolId.startsWith("cli:")) {
    return "cli";
  }

  return "integrated_agent";
}

function buildToolBindings(agent: AgentRecord): ToolBindingRecord[] {
  return agent.toolNames.map((toolId) => ({
    toolId,
    allowed: true,
    adapterKind: inferAdapterKind(toolId),
    purpose: agent.description || `Support ${agent.name} during the team run`,
    costClass: "medium",
  }));
}

function buildTeamAgent(agent: AgentRecord, teamId: string, orderHint: number): TeamAgentRecord {
  return {
    id: `team-agent-${agent.id}`,
    teamId,
    name: agent.name,
    role: agent.name,
    responsibility: agent.description || `${agent.name} contributes to the team run.`,
    systemPrompt: agent.systemPrompt,
    toolBindings: buildToolBindings(agent),
    toolUsePolicy: {
      maxCallsPerRound: 1,
      summarizeOutput: true,
    },
    orderHint,
    createdAt: "",
    updatedAt: "",
  };
}

function buildAssignment(
  agentId: string,
  teamId: string,
  orderHint: number,
): TeamAgentAssignmentRecord {
  return {
    id: `assignment-${agentId}`,
    teamId,
    agentId,
    enabled: true,
    orderHint,
    promptOverride: null,
    permissionOverrideJson: "{}",
    createdAt: "",
    updatedAt: "",
  };
}

function normalizeTeam(team: TeamRecord): TeamRecord {
  return {
    ...team,
    agents: team.agents.map((agent, index) => ({
      ...agent,
      orderHint: index,
    })),
    agentAssignments: team.agentAssignments.map((assignment, index) => ({
      ...assignment,
      orderHint: index,
    })),
  };
}

export function TeamPage() {
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [availableAgents, setAvailableAgents] = useState<AgentRecord[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [editorTeam, setEditorTeam] = useState<TeamRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void Promise.all([listTeams(), listAgents()])
      .then(([savedTeams, savedAgents]) => {
        if (!alive) {
          return;
        }

        const normalizedTeams = Array.isArray(savedTeams) ? savedTeams : [];
        setTeams(normalizedTeams);
        setSelectedTeamId(normalizedTeams[0]?.id ?? null);
        setAvailableAgents(Array.isArray(savedAgents) ? savedAgents : []);
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

  const handleFieldChange = (
    field: "summary" | "promptConstraints" | "permissionPolicy",
    value: string,
  ) => {
    setEditorTeam((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [field]: value,
      };
    });
  };

  const handleRemoveAssignedAgent = (agentId: string) => {
    setEditorTeam((current) => {
      if (!current) {
        return current;
      }

      const assignmentIndex = current.agentAssignments.findIndex(
        (assignment) => assignment.agentId === agentId,
      );
      if (assignmentIndex === -1) {
        return current;
      }

      return normalizeTeam({
        ...current,
        agents: current.agents.filter((_, index) => index !== assignmentIndex),
        agentAssignments: current.agentAssignments.filter((_, index) => index !== assignmentIndex),
      });
    });
  };

  const handleAddAssignedAgent = (agentId: string) => {
    setEditorTeam((current) => {
      if (!current || current.agentAssignments.some((assignment) => assignment.agentId === agentId)) {
        return current;
      }

      const agent = availableAgents.find((item) => item.id === agentId);
      if (!agent) {
        return current;
      }

      const orderHint = current.agentAssignments.length;
      return normalizeTeam({
        ...current,
        agents: [...current.agents, buildTeamAgent(agent, current.id, orderHint)],
        agentAssignments: [
          ...current.agentAssignments,
          buildAssignment(agent.id, current.id, orderHint),
        ],
      });
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
          availableAgents={availableAgents}
          error={error}
          isSaving={isSaving}
          isStartingRun={isStartingRun}
          notice={notice}
          onAddAssignedAgent={handleAddAssignedAgent}
          onChangeField={handleFieldChange}
          onRemoveAssignedAgent={handleRemoveAssignedAgent}
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
