"use client";

import { useEffect, useState } from "react";
import PageLayout from "@/components/PageLayout";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Agent, Team } from "@/lib/types";

function TeamCard({ team }: { team: Team }) {
  return (
    <div className="bg-nuka-card rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="font-[var(--font-oswald)] text-base font-bold text-white">
          {team.name}
        </span>
        <span className="text-xs text-nuka-teal px-2 py-1 bg-nuka-teal/10 rounded">
          {team.strategy}
        </span>
      </div>
      <p className="text-xs text-nuka-muted">{team.description}</p>
      <div className="flex gap-2 flex-wrap">
        {team.members?.map((m) => (
          <span key={m} className="text-xs text-nuka-muted bg-nuka-elevated px-2 py-1 rounded">
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

function CreateTeamForm({
  agents,
  onCreated,
  onCancel,
}: {
  agents: Agent[];
  onCreated: (t: Team) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    id: "", name: "", description: "", strategy: "round_robin",
  });
  const [members, setMembers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const toggleMember = (id: string) => {
    setMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const submit = async () => {
    if (!form.name || members.length === 0) return;
    setSubmitting(true);
    try {
      const team = await api.createTeam({
        id: form.id || form.name.toLowerCase().replace(/\s+/g, "-"),
        name: form.name,
        description: form.description,
        strategy: form.strategy,
        members,
      });
      onCreated(team);
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  const fc = "w-full bg-nuka-elevated rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-nuka-muted";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-nuka-card rounded-2xl p-6 w-[420px] flex flex-col gap-4">
        <span className="font-[var(--font-oswald)] text-lg font-bold text-white">
          {t("team.create")}
        </span>
        <input className={fc} placeholder={t("team.name")} value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        <textarea className={`${fc} h-16 resize-none`} placeholder={t("team.desc")} value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        <select className={fc} value={form.strategy}
          onChange={(e) => setForm((p) => ({ ...p, strategy: e.target.value }))}>
          <option value="round_robin">Round Robin</option>
          <option value="broadcast">Broadcast</option>
          <option value="chain">Chain</option>
        </select>
        <div className="flex flex-col gap-2">
          <span className="text-xs text-nuka-muted">{t("team.members")}</span>
          <div className="flex gap-2 flex-wrap">
            {agents.map((a) => (
              <button key={a.persona.id} onClick={() => toggleMember(a.persona.id)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  members.includes(a.persona.id)
                    ? "bg-nuka-orange text-white"
                    : "bg-nuka-elevated text-nuka-muted hover:text-white"
                }`}>
                {a.persona?.name || a.persona.id}
              </button>
            ))}
            {agents.length === 0 && (
              <span className="text-xs text-nuka-muted">No agents available</span>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onCancel} className="text-sm text-nuka-muted hover:text-white transition-colors">
            {t("team.cancel")}
          </button>
          <button onClick={submit} disabled={submitting || !form.name || members.length === 0}
            className="text-sm text-nuka-orange hover:text-white transition-colors disabled:opacity-50">
            {t("team.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamsPage() {
  const { t } = useI18n();
  const [teams, setTeams] = useState<Team[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    Promise.all([
      api.listTeams().then(setTeams).catch(() => {}),
      api.listAgents().then(setAgents).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <PageLayout>
      <div className="flex flex-col gap-6 p-8">
        <PageHeader title={t("team.title")} subtitle={t("team.subtitle")} />
        <div className="flex justify-end">
          <button onClick={() => setShowCreate(true)}
            className="text-sm text-nuka-orange hover:text-white transition-colors">
            + {t("team.create")}
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {loading && (
            <span className="text-sm text-nuka-muted">{t("common.loading")}</span>
          )}
          {!loading && teams.length === 0 && (
            <span className="text-sm text-nuka-muted">{t("team.no_teams")}</span>
          )}
          {teams.map((tm) => (
            <TeamCard key={tm.id} team={tm} />
          ))}
        </div>
      </div>
      {showCreate && (
        <CreateTeamForm
          agents={agents}
          onCreated={(tm) => { setTeams((p) => [...p, tm]); setShowCreate(false); }}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </PageLayout>
  );
}
