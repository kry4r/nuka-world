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

function MCPCard({
  server,
  onRemove,
}: {
  server: SkillConfig;
  onRemove: (name: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="bg-nuka-card rounded-2xl p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-[var(--font-oswald)] text-base font-bold text-white">
          {server.name}
        </span>
        <span className={`text-xs px-2 py-1 rounded ${
          server.status === "active"
            ? "text-nuka-teal bg-nuka-teal/10"
            : "text-nuka-muted bg-nuka-elevated"
        }`}>
          {server.status}
        </span>
      </div>
      {server.description && (
        <p className="text-xs text-nuka-muted">{server.description}</p>
      )}
      {server.endpoint && (
        <span className="text-xs text-nuka-muted">URL: {server.endpoint}</span>
      )}
      <div className="flex justify-end">
        <button
          onClick={() => onRemove(server.name)}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          {t("mcp.remove")}
        </button>
      </div>
    </div>
  );
}

function AddMCPForm({
  onCreated,
  onCancel,
}: {
  onCreated: (s: SkillConfig) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: "",
    endpoint: "",
    description: "",
    transport: "sse",
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.name || !form.endpoint) return;
    setSubmitting(true);
    try {
      const s = await api.addSkill({
        name: form.name,
        type: "mcp",
        description: form.description || `MCP server (${form.transport})`,
        endpoint: form.endpoint,
      });
      onCreated(s);
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  const fc =
    "w-full bg-nuka-elevated rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-nuka-muted";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-nuka-card rounded-2xl p-6 w-[420px] flex flex-col gap-4">
        <span className="font-[var(--font-oswald)] text-lg font-bold text-white">
          {t("mcp.add")}
        </span>
        <input
          className={fc}
          placeholder={t("mcp.name")}
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
        />
        <input
          className={fc}
          placeholder={t("mcp.endpoint")}
          value={form.endpoint}
          onChange={(e) => setForm((p) => ({ ...p, endpoint: e.target.value }))}
        />
        <select
          className={fc}
          value={form.transport}
          onChange={(e) => setForm((p) => ({ ...p, transport: e.target.value }))}
        >
          <option value="sse">SSE</option>
          <option value="stdio">Stdio</option>
          <option value="http">HTTP</option>
        </select>
        <textarea
          className={`${fc} h-16 resize-none`}
          placeholder={t("mcp.desc")}
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
        />
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className="text-sm text-nuka-muted hover:text-white transition-colors"
          >
            {t("mcp.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={submitting || !form.name || !form.endpoint}
            className="text-sm text-nuka-orange hover:text-white transition-colors disabled:opacity-50"
          >
            {t("mcp.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MCPPage() {
  const { t } = useI18n();
  const [servers, setServers] = useState<SkillConfig[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    api.listSkills()
      .then((all) => setServers(all.filter((s) => s.type === "mcp")))
      .catch(() => {});
  }, []);

  const handleRemove = async (name: string) => {
    try {
      await api.removeSkill(name);
      setServers((prev) => prev.filter((s) => s.name !== name));
    } catch { /* ignore */ }
  };

  const active = servers.filter((s) => s.status === "active").length;

  return (
    <PageLayout>
      <div className="flex flex-col gap-6 p-8">
        <PageHeader title={t("mcp.title")} subtitle={t("mcp.subtitle")} />
        <div className="flex gap-4">
          <StatBox label={t("mcp.total")} value={String(servers.length)} />
          <StatBox label={t("mcp.active")} value={String(active)} />
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm text-nuka-orange hover:text-white transition-colors"
          >
            + {t("mcp.add")}
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {servers.length === 0 && (
            <span className="text-sm text-nuka-muted">{t("mcp.no_servers")}</span>
          )}
          {servers.map((s) => (
            <MCPCard key={s.name} server={s} onRemove={handleRemove} />
          ))}
        </div>
      </div>
      {showAdd && (
        <AddMCPForm
          onCreated={(s) => {
            setServers((prev) => [...prev, s]);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}
    </PageLayout>
  );
}
