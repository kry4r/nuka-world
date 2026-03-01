"use client";

import { useEffect, useState } from "react";
import PageLayout from "@/components/PageLayout";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { SkillConfig } from "@/lib/types";

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 bg-nuka-card rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-nuka-muted">{label}</span>
      <span className="font-[var(--font-oswald)] text-lg font-bold text-white">{value}</span>
    </div>
  );
}

function SkillCard({
  skill,
  onRemove,
}: {
  skill: SkillConfig;
  onRemove: (name: string) => void;
}) {
  const { t } = useI18n();
  const typeLabel =
    skill.type === "mcp" ? t("skill.type_mcp")
    : skill.type === "builtin" ? t("skill.type_builtin")
    : t("skill.type_custom");

  return (
    <div className="bg-nuka-card rounded-2xl p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-[var(--font-oswald)] text-base font-bold text-white">
          {skill.name}
        </span>
        <span className="text-xs text-nuka-teal px-2 py-1 bg-nuka-teal/10 rounded">
          {typeLabel}
        </span>
      </div>
      <p className="text-xs text-nuka-muted">{skill.description}</p>
      {skill.endpoint && (
        <span className="text-xs text-nuka-muted">Endpoint: {skill.endpoint}</span>
      )}
      {skill.command && (
        <span className="text-xs text-nuka-muted">Command: {skill.command}</span>
      )}
      <div className="flex items-center justify-between">
        <span className={`text-xs px-2 py-1 rounded ${
          skill.status === "active"
            ? "text-nuka-teal bg-nuka-teal/10"
            : "text-nuka-muted bg-nuka-elevated"
        }`}>
          {skill.status}
        </span>
        <button
          onClick={() => onRemove(skill.name)}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          {t("skill.remove")}
        </button>
      </div>
    </div>
  );
}

function AddSkillForm({
  onCreated,
  onCancel,
}: {
  onCreated: (s: SkillConfig) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: "", type: "mcp", description: "", endpoint: "", command: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.name || !form.type) return;
    setSubmitting(true);
    try {
      const s = await api.addSkill({
        name: form.name,
        type: form.type,
        description: form.description,
        endpoint: form.endpoint || undefined,
        command: form.command || undefined,
      });
      onCreated(s);
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  const fc = "w-full bg-nuka-elevated rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-nuka-muted";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-nuka-card rounded-2xl p-6 w-[420px] flex flex-col gap-4">
        <span className="font-[var(--font-oswald)] text-lg font-bold text-white">
          {t("skill.add")}
        </span>
        <input className={fc} placeholder={t("skill.name")}
          value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        <select className={fc} value={form.type}
          onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
          <option value="mcp">MCP Server</option>
          <option value="builtin">Built-in</option>
          <option value="custom">Custom</option>
        </select>
        <textarea className={`${fc} h-16 resize-none`} placeholder={t("skill.desc")}
          value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        {form.type === "mcp" && (
          <input className={fc} placeholder={t("skill.endpoint")}
            value={form.endpoint} onChange={(e) => setForm((p) => ({ ...p, endpoint: e.target.value }))} />
        )}
        {form.type === "custom" && (
          <input className={fc} placeholder={t("skill.command")}
            value={form.command} onChange={(e) => setForm((p) => ({ ...p, command: e.target.value }))} />
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onCancel} className="text-sm text-nuka-muted hover:text-white transition-colors">
            {t("skill.cancel")}
          </button>
          <button onClick={submit} disabled={submitting || !form.name}
            className="text-sm text-nuka-orange hover:text-white transition-colors disabled:opacity-50">
            {t("skill.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const { t } = useI18n();
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    api.listSkills().then((s) => setSkills(s || [])).catch(() => {});
  }, []);

  const handleRemove = async (name: string) => {
    try {
      await api.removeSkill(name);
      setSkills((prev) => prev.filter((s) => s.name !== name));
    } catch { /* ignore */ }
  };

  const active = skills.filter((s) => s.status === "active").length;

  return (
    <PageLayout>
      <div className="flex flex-col gap-6 p-8">
        <PageHeader title={t("skill.title")} subtitle={t("skill.subtitle")} />
        <div className="flex gap-4">
          <StatBox label={t("skill.total")} value={String(skills.length)} />
          <StatBox label={t("skill.active")} value={String(active)} />
        </div>
        <div className="flex justify-end">
          <button onClick={() => setShowAdd(true)}
            className="text-sm text-nuka-orange hover:text-white transition-colors">
            + {t("skill.add")}
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {skills.length === 0 && (
            <span className="text-sm text-nuka-muted">{t("skill.no_skills")}</span>
          )}
          {skills.map((s) => (
            <SkillCard key={s.name} skill={s} onRemove={handleRemove} />
          ))}
        </div>
      </div>
      {showAdd && (
        <AddSkillForm
          onCreated={(s) => { setSkills((prev) => [...prev, s]); setShowAdd(false); }}
          onCancel={() => setShowAdd(false)}
        />
      )}
    </PageLayout>
  );
}
