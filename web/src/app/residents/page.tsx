"use client";

import { useEffect, useState } from "react";
import PageLayout from "@/components/PageLayout";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Agent } from "@/lib/types";

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex-1 bg-nuka-card rounded-2xl px-5 py-4 flex flex-col gap-1 justify-center h-[72px]">
      <span className="text-xs text-nuka-muted">{label}</span>
      <span className="font-[var(--font-oswald)] text-xl font-bold text-white">{value}</span>
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className="bg-nuka-card rounded-2xl p-5 flex flex-col gap-3 w-[280px] h-[200px]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-nuka-placeholder" />
        <div className="flex flex-col">
          <span className="text-sm font-bold text-white">
            {agent.persona?.name || agent.persona?.id}
          </span>
          <span className="text-xs text-nuka-muted">{agent.model}</span>
        </div>
      </div>
      <p className="text-xs text-nuka-muted line-clamp-3 flex-1">
        {agent.persona?.personality || "No personality set"}
      </p>
      <div className="flex items-center justify-between">
        <span className={`text-xs ${agent.status === "active" ? "text-nuka-teal" : "text-nuka-muted"}`}>
          ● {agent.status || "idle"}
        </span>
      </div>
    </div>
  );
}

function CreateAgentForm({ onCreated, onCancel }: { onCreated: (a: Agent) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ id: "", name: "", role: "", model: "", personality: "", backstory: "", system_prompt: "" });
  const [submitting, setSubmitting] = useState(false);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.id || !form.name) return;
    setSubmitting(true);
    try {
      const agent = await api.createAgent({
        persona: {
          id: form.id, name: form.name, role: form.role,
          personality: form.personality, backstory: form.backstory,
          system_prompt: form.system_prompt,
          sprite: { base_sprite: "", idle_anim: "", work_anim: "", think_anim: "", palette: "" },
          skills: null, traits: null,
        },
        model: form.model || "generalv3.5",
      });
      onCreated(agent);
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  const fc = "w-full bg-nuka-elevated rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-nuka-muted";
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-nuka-card rounded-2xl p-6 w-[420px] flex flex-col gap-4">
        <span className="font-[var(--font-oswald)] text-lg font-bold text-white">{t("res.create")}</span>
        <input className={fc} placeholder="ID" value={form.id} onChange={(e) => set("id", e.target.value)} />
        <input className={fc} placeholder={t("res.name")} value={form.name} onChange={(e) => set("name", e.target.value)} />
        <input className={fc} placeholder={t("res.role")} value={form.role} onChange={(e) => set("role", e.target.value)} />
        <input className={fc} placeholder={t("res.model")} value={form.model} onChange={(e) => set("model", e.target.value)} />
        <textarea className={`${fc} h-20 resize-none`} placeholder={t("res.personality")} value={form.personality} onChange={(e) => set("personality", e.target.value)} />
        <textarea className={`${fc} h-16 resize-none`} placeholder={t("res.backstory")} value={form.backstory} onChange={(e) => set("backstory", e.target.value)} />
        <textarea className={`${fc} h-16 resize-none`} placeholder={t("res.system_prompt")} value={form.system_prompt} onChange={(e) => set("system_prompt", e.target.value)} />
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onCancel} className="text-sm text-nuka-muted hover:text-white transition-colors">{t("res.cancel")}</button>
          <button onClick={submit} disabled={submitting || !form.id || !form.name} className="text-sm text-nuka-orange hover:text-white transition-colors disabled:opacity-50">{t("res.submit")}</button>
        </div>
      </div>
    </div>
  );
}

export default function ResidentsPage() {
  const { t } = useI18n();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api.listAgents().then(setAgents).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const active = agents.filter((a) => a.status === "active").length;
  const idle = agents.filter((a) => !a.status || a.status === "idle").length;
  const resting = agents.filter((a) => a.status === "resting").length;

  return (
    <PageLayout>
      <div className="flex flex-col gap-6 p-8">
        <PageHeader title={t("res.title")} subtitle={t("res.subtitle")} />
        <div className="flex gap-4">
          <StatBox label={t("res.total")} value={agents.length} />
          <StatBox label={t("res.active")} value={active} />
          <StatBox label={t("res.idle")} value={idle} />
          <StatBox label={t("res.resting")} value={resting} />
        </div>
        <div className="flex justify-end">
          <button onClick={() => setShowCreate(true)}
            className="text-sm text-nuka-orange hover:text-white transition-colors">
            + {t("res.create")}
          </button>
        </div>
        <div className="flex flex-wrap gap-4">
          {loading && (
            <span className="text-sm text-nuka-muted">{t("common.loading")}</span>
          )}
          {!loading && agents.length === 0 && (
            <span className="text-sm text-nuka-muted">{t("res.no_agents")}</span>
          )}
          {agents.map((a) => (
            <AgentCard key={a.persona.id} agent={a} />
          ))}
        </div>
      </div>
      {showCreate && (
        <CreateAgentForm
          onCreated={(a) => { setAgents((prev) => [...prev, a]); setShowCreate(false); }}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </PageLayout>
  );
}
