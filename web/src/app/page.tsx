"use client";

import { useEffect, useState } from "react";
import PageLayout from "@/components/PageLayout";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import type { Agent, WorldStatus, Team, A2ATask } from "@/lib/types";

function MetricCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`flex-1 rounded-2xl p-5 flex flex-col gap-4 ${accent ? "bg-nuka-orange" : "bg-nuka-card"}`}>
      <span className={`text-xs ${accent ? "text-white/70" : "text-nuka-muted"}`}>{label}</span>
      <span className="font-[var(--font-oswald)] text-3xl font-bold text-white">{value}</span>
    </div>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-nuka-placeholder" />
        <div className="flex flex-col">
          <span className="text-sm text-white">{agent.persona?.name || agent.persona?.id}</span>
          <span className="text-xs text-nuka-muted">{agent.model}</span>
        </div>
      </div>
      <span className={`text-xs ${agent.status === "active" ? "text-nuka-teal" : "text-nuka-muted"}`}>
        ● {agent.status || "idle"}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tasks, setTasks] = useState<A2ATask[]>([]);
  const [world, setWorld] = useState<WorldStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.worldStatus().then(setWorld).catch((e) => setError(e.message));
    api.listAgents().then(setAgents).catch(() => {});
    api.listTeams().then(setTeams).catch(() => {});
    api.listA2ATasks().then(setTasks).catch(() => {});
  }, []);

  const activeCount = agents.filter((a) => a.status === "active").length;
  const activeTasks = tasks.filter((t) => t.status === "working" || t.status === "planning").length;

  return (
    <PageLayout>
      <div className="flex flex-col gap-8 p-10 px-12">
        <PageHeader title="DASHBOARD" subtitle="Nuka World Overview" />
        {error && <div className="text-nuka-orange text-xs">Backend: {error}</div>}

        <div className="flex gap-4">
          <MetricCard label="RESIDENTS" value={agents.length} />
          <MetricCard label="TEAMS" value={teams.length} />
          <MetricCard label="A2A TASKS" value={tasks.length} />
          <MetricCard label="ACTIVE TASKS" value={activeTasks} accent />
        </div>

        <div className="flex gap-4 flex-1">
          <div className="flex-1 flex flex-col gap-4">
            <span className="font-[var(--font-oswald)] text-lg font-bold text-white">RESIDENTS</span>
            <div className="flex flex-col gap-1">
              {agents.length === 0 && <span className="text-xs text-nuka-muted">No agents registered</span>}
              {agents.map((a) => <AgentRow key={a.persona.id} agent={a} />)}
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-4">
            <span className="font-[var(--font-oswald)] text-lg font-bold text-white">WORLD ACTIVITY</span>
            <div className="text-xs text-nuka-muted">
              {world ? `World Time: ${world.world_time}` : "Connecting..."}
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
