"use client";

import { useEffect, useState } from "react";
import PageLayout from "@/components/PageLayout";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { AdapterConfig } from "@/lib/types";

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 bg-nuka-card rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-nuka-muted">{label}</span>
      <span className="font-[var(--font-oswald)] text-lg font-bold text-white">{value}</span>
    </div>
  );
}

function AdapterCard({
  adapter,
  onConfigure,
}: {
  adapter: AdapterConfig;
  onConfigure: (a: AdapterConfig) => void;
}) {
  const { t } = useI18n();
  const isConfigured = adapter.status === "configured" || adapter.status === "connected";
  return (
    <div className="bg-nuka-card rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="font-[var(--font-oswald)] text-base font-bold text-white">{adapter.name}</span>
        <span className={`text-xs px-2 py-1 rounded ${
          isConfigured ? "text-nuka-teal bg-nuka-teal/10" : "text-nuka-muted bg-nuka-elevated"
        }`}>
          {adapter.status}
        </span>
      </div>
      <span className="text-xs text-nuka-muted">Type: {adapter.type}</span>
      {adapter.settings && Object.keys(adapter.settings).length > 0 && (
        <div className="flex flex-col gap-1">
          {Object.entries(adapter.settings).map(([k, v]) => (
            <span key={k} className="text-xs text-nuka-muted">
              {k}: {k.includes("token") ? "••••••" : v}
            </span>
          ))}
        </div>
      )}
      <button
        onClick={() => onConfigure(adapter)}
        className="text-xs text-nuka-orange hover:text-white transition-colors self-end"
      >
        {t("gw.configure")}
      </button>
    </div>
  );
}

function AdapterForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing: AdapterConfig | null;
  onSaved: (a: AdapterConfig) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: editing?.name || "",
    type: editing?.type || "slack",
    webhook_url: editing?.settings?.webhook_url || "",
    bot_token: editing?.settings?.bot_token || "",
    channel: editing?.settings?.channel || "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState("");

  const submit = async () => {
    if (!form.name) return;
    setSubmitting(true);
    setResult("");
    try {
      const settings: Record<string, string> = {};
      if (form.webhook_url) settings.webhook_url = form.webhook_url;
      if (form.bot_token) settings.bot_token = form.bot_token;
      if (form.channel) settings.channel = form.channel;
      const saved = await api.saveAdapter({
        name: form.name,
        type: form.type,
        settings,
      });
      onSaved(saved);
      setResult("saved");
    } catch {
      setResult("failed");
    }
    setSubmitting(false);
  };

  const fc = "w-full bg-nuka-elevated rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-nuka-muted";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-nuka-card rounded-2xl p-6 w-[420px] flex flex-col gap-4">
        <span className="font-[var(--font-oswald)] text-lg font-bold text-white">
          {t("gw.configure")}
        </span>
        <input className={fc} placeholder={t("gw.adapter_name")}
          value={form.name} disabled={!!editing}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        <select className={fc} value={form.type}
          onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
          <option value="slack">Slack</option>
          <option value="discord">Discord</option>
          <option value="http">HTTP</option>
        </select>
        <input className={fc} placeholder={t("gw.webhook_url")}
          value={form.webhook_url}
          onChange={(e) => setForm((p) => ({ ...p, webhook_url: e.target.value }))} />
        <input className={fc} placeholder={t("gw.bot_token")} type="password"
          value={form.bot_token}
          onChange={(e) => setForm((p) => ({ ...p, bot_token: e.target.value }))} />
        <input className={fc} placeholder={t("gw.channel")}
          value={form.channel}
          onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value }))} />
        {result && (
          <span className={`text-xs ${result === "saved" ? "text-nuka-teal" : "text-red-400"}`}>
            {result === "saved" ? t("gw.save_success") : t("gw.save_failed")}
          </span>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onCancel}
            className="text-sm text-nuka-muted hover:text-white transition-colors">
            {t("common.cancel")}
          </button>
          <button onClick={submit} disabled={submitting || !form.name}
            className="text-sm text-nuka-orange hover:text-white transition-colors disabled:opacity-50">
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GatewayPage() {
  const { t } = useI18n();
  const [adapters, setAdapters] = useState<AdapterConfig[]>([]);
  const [status, setStatus] = useState("checking...");
  const [editing, setEditing] = useState<AdapterConfig | null | "new">(null);

  useEffect(() => {
    api.health()
      .then(() => setStatus("connected"))
      .catch(() => setStatus("offline"));
    api.listAdapters().then(setAdapters).catch(() => {});
  }, []);

  const configured = adapters.filter((a) => a.status === "configured" || a.status === "connected").length;

  const handleSaved = (saved: AdapterConfig) => {
    setAdapters((prev) => {
      const idx = prev.findIndex((a) => a.name === saved.name);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setEditing(null);
  };

  return (
    <PageLayout>
      <div className="flex flex-col gap-6 p-8">
        <PageHeader title={t("gw.title")} subtitle={t("gw.subtitle")} />
        <div className="flex gap-4">
          <StatBox label={t("gw.status")} value={status} />
          <StatBox label={t("gw.adapters")} value={String(adapters.length)} />
          <StatBox label={t("gw.connected")} value={String(configured)} />
        </div>
        <div className="flex justify-end">
          <button onClick={() => setEditing("new")}
            className="text-sm text-nuka-orange hover:text-white transition-colors">
            + {t("gw.add_adapter")}
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {adapters.length === 0 && (
            <span className="text-sm text-nuka-muted">{t("gw.no_adapters")}</span>
          )}
          {adapters.map((a) => (
            <AdapterCard key={a.name} adapter={a} onConfigure={(ad) => setEditing(ad)} />
          ))}
        </div>
      </div>
      {editing !== null && (
        <AdapterForm
          editing={editing === "new" ? null : editing}
          onSaved={handleSaved}
          onCancel={() => setEditing(null)}
        />
      )}
    </PageLayout>
  );
}
