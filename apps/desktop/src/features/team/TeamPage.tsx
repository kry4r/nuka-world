import { useEffect, useMemo, useState } from "react";
import { listAgents, type AgentRecord } from "@/lib/agents";
import { emitToast } from "@/lib/toast";
import { listWorkspaceSessions } from "@/lib/workspace";
import {
  createTeamFromGoal,
  listTeams,
  loadTeamRun,
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
    agentAssignments: team.agentAssignments.map((assignment) => ({
      ...assignment,
    })),
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
    purpose: agent.description || `支持 ${agent.name} 参与当前协作团队`,
    costClass: "medium",
  }));
}

function buildTeamAgent(
  agent: AgentRecord,
  teamId: string,
  orderHint: number,
): TeamAgentRecord {
  return {
    id: `team-agent-${agent.id}`,
    teamId,
    name: agent.name,
    role: agent.name,
    responsibility:
      agent.description || `${agent.name} 负责推进当前协作团队中的分工任务。`,
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

function toErrorMessage(caughtError: unknown) {
  return caughtError instanceof Error
    ? caughtError.message
    : String(caughtError);
}

type RecentTeamLaunch = {
  id: string;
  summary: string;
  teamId: string;
  title: string;
  updatedAt: string;
};

function formatTeamStatus(status: string) {
  switch (status) {
    case "ready":
      return "准备就绪";
    case "draft":
      return "草稿";
    default:
      return status;
  }
}

function formatRunStatus(status: string) {
  switch (status) {
    case "waiting_for_user":
      return "等待跟进";
    case "queued":
      return "排队中";
    case "blocked":
      return "已阻塞";
    case "stuck":
      return "卡住";
    case "completed":
    case "done":
      return "已完成";
    case "running":
      return "运行中";
    default:
      return status;
  }
}

function buildRecentLaunch(run: Awaited<ReturnType<typeof loadTeamRun>>) {
  if (!run) {
    return null;
  }

  return {
    id: run.id,
    summary: `${formatRunStatus(run.status)} · ${run.updatedAt.replace("T", " ").slice(0, 16)}`,
    teamId: run.teamId,
    title: run.title,
    updatedAt: run.updatedAt,
  };
}

async function loadRecentLaunches(teams: TeamRecord[]) {
  const teamIds = new Set(teams.map((team) => team.id));
  if (teamIds.size === 0) {
    return {} as Record<string, RecentTeamLaunch[]>;
  }

  try {
    const sessions = await listWorkspaceSessions();
    const launches = (
      await Promise.all(
        sessions
          .filter((session) => session.kind === "team_run")
          .map(async (session) =>
            buildRecentLaunch(await loadTeamRun(session.id)),
          ),
      )
    ).filter(
      (
        launch,
      ): launch is RecentTeamLaunch & {
        teamId: string;
      } => launch !== null && teamIds.has(launch.teamId),
    );

    return launches.reduce<Record<string, RecentTeamLaunch[]>>(
      (groups, launch) => {
        const current = groups[launch.teamId] ?? [];
        groups[launch.teamId] = [...current, launch]
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .slice(0, 5);
        return groups;
      },
      {},
    );
  } catch {
    return {};
  }
}

export function TeamPage() {
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [availableAgents, setAvailableAgents] = useState<AgentRecord[]>([]);
  const [recentLaunchesByTeam, setRecentLaunchesByTeam] = useState<
    Record<string, RecentTeamLaunch[]>
  >({});
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [editorTeam, setEditorTeam] = useState<TeamRecord | null>(null);
  const [createGoalDraft, setCreateGoalDraft] = useState("");
  const [isGeneratingTeam, setIsGeneratingTeam] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);

  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const [savedTeams, savedAgents] = await Promise.all([
          listTeams(),
          listAgents(),
        ]);
        const normalizedTeams = Array.isArray(savedTeams) ? savedTeams : [];
        const nextRecentLaunches = await loadRecentLaunches(normalizedTeams);

        if (!alive) {
          return;
        }

        setTeams(normalizedTeams);
        setSelectedTeamId(normalizedTeams[0]?.id ?? null);
        setAvailableAgents(Array.isArray(savedAgents) ? savedAgents : []);
        setRecentLaunchesByTeam(nextRecentLaunches);
      } catch (caughtError) {
        if (!alive) {
          return;
        }

        emitToast({
          message: toErrorMessage(caughtError),
          tone: "error",
        });
      }
    })();

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

  const handleToggleTool = (
    agentId: string,
    toolId: string,
    allowed: boolean,
  ) => {
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
    field:
      | "summary"
      | "promptConstraints"
      | "permissionPolicy"
      | "successCriteria"
      | "coordinationPolicy",
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
        agentAssignments: current.agentAssignments.filter(
          (_, index) => index !== assignmentIndex,
        ),
      });
    });
  };

  const handleAddAssignedAgent = (agentId: string) => {
    setEditorTeam((current) => {
      if (
        !current ||
        current.agentAssignments.some(
          (assignment) => assignment.agentId === agentId,
        )
      ) {
        return current;
      }

      const agent = availableAgents.find((item) => item.id === agentId);
      if (!agent) {
        return current;
      }

      const orderHint = current.agentAssignments.length;
      return normalizeTeam({
        ...current,
        agents: [
          ...current.agents,
          buildTeamAgent(agent, current.id, orderHint),
        ],
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

    try {
      const saved = await updateTeam(editorTeam);
      setTeams((current) =>
        current.map((team) => (team.id === saved.id ? saved : team)),
      );
      setEditorTeam(cloneTeam(saved));
      emitToast({
        message: "协作团队模板已保存。",
        tone: "success",
      });
    } catch (caughtError) {
      emitToast({
        message: toErrorMessage(caughtError),
        tone: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateTeamFromGoal = async () => {
    const goal = createGoalDraft.trim();
    if (!goal) {
      return;
    }

    setIsGeneratingTeam(true);

    try {
      const createdTeam = await createTeamFromGoal(goal);
      const normalizedTeam = normalizeTeam(createdTeam);
      setTeams((current) => [
        normalizedTeam,
        ...current.filter((team) => team.id !== normalizedTeam.id),
      ]);
      setSelectedTeamId(normalizedTeam.id);
      setEditorTeam(cloneTeam(normalizedTeam));
      setCreateGoalDraft("");
      emitToast({
        message: "协作团队模板已生成，可继续微调字段。",
        tone: "success",
      });
    } catch (caughtError) {
      emitToast({
        message: toErrorMessage(caughtError),
        tone: "error",
      });
    } finally {
      setIsGeneratingTeam(false);
    }
  };

  const handleStartRun = async () => {
    if (!editorTeam) {
      return;
    }

    setIsStartingRun(true);

    try {
      const run = await startTeamRun(editorTeam.id);
      setRecentLaunchesByTeam((current) => {
        const nextLaunch = buildRecentLaunch(run);
        if (!nextLaunch) {
          return current;
        }

        return {
          ...current,
          [editorTeam.id]: [
            nextLaunch,
            ...(current[editorTeam.id] ?? []).filter(
              (launch) => launch.id !== nextLaunch.id,
            ),
          ].slice(0, 5),
        };
      });
      emitToast({
        message: `已启动协作流程：${run.title}`,
        tone: "success",
      });
      window.dispatchEvent(
        new CustomEvent("nuka:navigate", {
          detail: {
            page: "chat",
            sessionId: run.id,
            kind: "team_run",
          },
        }),
      );
    } catch (caughtError) {
      emitToast({
        message: toErrorMessage(caughtError),
        tone: "error",
      });
    } finally {
      setIsStartingRun(false);
    }
  };

  const handleOpenLaunchInChat = (sessionId: string) => {
    window.dispatchEvent(
      new CustomEvent("nuka:navigate", {
        detail: {
          page: "chat",
          sessionId,
          kind: "team_run",
        },
      }),
    );
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
          createGoalDraft={createGoalDraft}
          isGeneratingTeam={isGeneratingTeam}
          isSaving={isSaving}
          isStartingRun={isStartingRun}
          onCreateGoalDraftChange={setCreateGoalDraft}
          onCreateTeamFromGoal={() => {
            void handleCreateTeamFromGoal();
          }}
          onAddAssignedAgent={handleAddAssignedAgent}
          onChangeField={handleFieldChange}
          onOpenLaunchInChat={handleOpenLaunchInChat}
          onRemoveAssignedAgent={handleRemoveAssignedAgent}
          onSave={() => {
            void handleSave();
          }}
          onStartRun={() => {
            void handleStartRun();
          }}
          onToggleTool={handleToggleTool}
          recentLaunches={
            selectedTeam ? (recentLaunchesByTeam[selectedTeam.id] ?? []) : []
          }
          team={editorTeam}
          teamStatusLabel={
            selectedTeam ? formatTeamStatus(selectedTeam.status) : ""
          }
        />
      </div>
    </div>
  );
}
