"use client";

import { useEffect, useState } from "react";
import PageLayout from "@/components/PageLayout";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ProviderConfig } from "@/lib/types";

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 bg-nuka-card rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-nuka-muted">{label}</span>
      <span className="font-[var(--font-oswald)] text-lg font-bold text-white">{value}</span>
    </div>
  );
}

function ProviderCard({ provider }: { provider: ProviderConfig }) {
  return (
    <div className="bg-nuka-card rounded-2xl p-6 flex flex-col gap-4 flex-1 min-w-[280px]">
      <div className="flex items-center justify-between">
        <span className="font-[var(--font-oswald)] text-base font-bold text-white">{provider.name}</span>
        <span className="text-xs text-nuka-teal px-2 py-1 bg-nuka-teal/10 rounded">{provider.type}</span>
      </div>
      <div className="text-xs text-nuka-muted">{provider.endpoint}</div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-nuka-muted">MODELS</span>
        <div className="flex gap-2 flex-wrap">
          {provider.models?.map((m) => (
            <span key={m} className="text-xs text-white bg-nuka-elevated px-2 py-1 rounded">{m}</span>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-nuka-muted">TOKEN USAGE</span>
        <span className="font-[var(--font-oswald)] text-sm font-bold text-nuka-orange">0</span>
      </div>
    </div>
  );
}

function AddProviderForm({
  onCreated,
  onCancel,
}: {
  onCreated: (p: ProviderConfig) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: "", url: "", token: "" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.name || !form.url) return;
    setSubmitting(true);
    try {
      const p = await api.addProvider({
        name: form.name,
        type: "openai-compatible",
        endpoint: form.url,
        api_key: form.token,
      });
      onCreated(p);
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  const fc = "w-full bg-nuka-elevated rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-nuka-muted";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-nuka-card rounded-2xl p-6 w-[420px] flex flex-col gap-4">
        <span className="font-[var(--font-oswald)] text-lg font-bold text-white">
          {t("prov.add")}
        </span>
        <input className={fc} placeholder={t("prov.name")}
          value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        <input className={fc} placeholder={t("prov.url")}
          value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} />
        <input className={fc} placeholder={t("prov.token")} type="password"
          value={form.token} onChange={(e) => setForm((p) => ({ ...p, token: e.target.value }))} />
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onCancel} className="text-sm text-nuka-muted hover:text-white transition-colors">
            {t("prov.cancel")}
          </button>
          <button onClick={submit} disabled={submitting || !form.name || !form.url}
            className="text-sm text-nuka-orange hover:text-white transition-colors disabled:opacity-50">
            {t("prov.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProvidersPage() {
  const { t } = useI18n();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [status, setStatus] = useState<string>("checking...");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    api.health()
      .then(() => setStatus("connected"))
      .catch(() => setStatus("offline"));
    api.listProviders().then(setProviders).catch(() => {});
  }, []);

  return (
    <PageLayout>
      <div className="flex flex-col gap-6 p-8">
        <PageHeader title={t("prov.title")} subtitle={t("prov.subtitle")} />
        <div className="flex gap-4">
          <StatBox label="STATUS" value={status} />
          <StatBox label="PROVIDERS" value={String(providers.length)} />
          <StatBox label="MODELS" value={String(providers.reduce((n, p) => n + (p.models?.length || 0), 0))} />
        </div>
        <div className="flex justify-end">
          <button onClick={() => setShowAdd(true)}
            className="text-sm text-nuka-orange hover:text-white transition-colors">
            + {t("prov.add")}
          </button>
        </div>
        <div className="flex gap-4 flex-wrap">
          {providers.length === 0 && (
            <span className="text-sm text-nuka-muted">{t("prov.no_providers")}</span>
          )}
          {providers.map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </div>
      </div>
      {showAdd && (
        <AddProviderForm
          onCreated={(p) => { setProviders((prev) => [...prev, p]); setShowAdd(false); }}
          onCancel={() => setShowAdd(false)}
        />
      )}
    </PageLayout>
  );
}
