"use client";

import { useEffect, useState, useCallback } from "react";
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

function ProviderCard({
  provider,
  onEdit,
  onDelete,
  onTest,
}: {
  provider: ProviderConfig;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="bg-nuka-card rounded-2xl p-6 flex flex-col gap-4 flex-1 min-w-[280px] border-2 border-nuka-elevated">
      <div className="flex items-center justify-between">
        <span className="font-[var(--font-oswald)] text-base font-bold text-white">
          {provider.name}
        </span>
        <span className="text-xs text-nuka-teal px-2 py-1 bg-nuka-teal/10 rounded">
          {provider.type}
        </span>
      </div>
      <div className="text-xs text-nuka-muted truncate">{provider.endpoint}</div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-nuka-muted">MODELS</span>
        <div className="flex gap-2 flex-wrap">
          {provider.models?.map((m) => (
            <span key={m} className="text-xs text-white bg-nuka-elevated px-2 py-1 rounded">
              {m}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-nuka-elevated">
        <button onClick={onEdit} className="text-xs text-nuka-muted hover:text-white transition-colors">
          {t("prov.edit")}
        </button>
        <span className="text-nuka-elevated">|</span>
        <button onClick={onTest} className="text-xs text-nuka-teal hover:text-white transition-colors">
          {t("prov.test")}
        </button>
        <span className="text-nuka-elevated">|</span>
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-300 transition-colors">
          {t("prov.delete")}
        </button>
      </div>
    </div>
  );
}

function ProviderEditModal({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ProviderConfig;
  onSave: (p: Partial<ProviderConfig>) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: initial?.name || "",
    type: initial?.type || "openai",
    endpoint: initial?.endpoint || "",
    api_key: "",
    models: initial?.models?.join(", ") || "",
  });
  const [submitting, setSubmitting] = useState(false);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name || !form.endpoint) return;
    setSubmitting(true);
    const payload: Partial<ProviderConfig> = {
      name: form.name,
      type: form.type,
      endpoint: form.endpoint,
      models: form.models.split(",").map((m) => m.trim()).filter(Boolean),
    };
    if (form.api_key) payload.api_key = form.api_key;
    onSave(payload);
    setSubmitting(false);
  };

  const fc = "w-full bg-nuka-elevated rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-nuka-muted";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-nuka-card rounded-2xl p-6 w-[420px] flex flex-col gap-4">
        <span className="font-[var(--font-oswald)] text-lg font-bold text-white">
          {initial ? t("prov.edit") : t("prov.add")}
        </span>
        <input className={fc} placeholder={t("prov.name")}
          value={form.name} onChange={(e) => set("name", e.target.value)} />
        <select className={fc} value={form.type} onChange={(e) => set("type", e.target.value)}>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
        <input className={fc} placeholder={t("prov.endpoint")}
          value={form.endpoint} onChange={(e) => set("endpoint", e.target.value)} />
        <input className={fc} placeholder={t("prov.token")} type="password"
          value={form.api_key} onChange={(e) => set("api_key", e.target.value)} />
        <input className={fc} placeholder={t("prov.models_label")}
          value={form.models} onChange={(e) => set("models", e.target.value)} />
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onCancel}
            className="text-sm text-nuka-muted hover:text-white transition-colors">
            {t("prov.cancel")}
          </button>
          <button onClick={submit} disabled={submitting || !form.name || !form.endpoint}
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
  const [editTarget, setEditTarget] = useState<ProviderConfig | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState("");

  const refresh = useCallback(() => {
    api.listProviders().then((p) => setProviders(p || [])).catch(() => {});
  }, []);

  useEffect(() => {
    api.health()
      .then(() => setStatus("connected"))
      .catch(() => setStatus("offline"));
    refresh();
  }, [refresh]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleAdd = async (data: Partial<ProviderConfig>) => {
    try {
      await api.addProvider(data);
      setShowAdd(false);
      refresh();
    } catch { showToast("Failed to add provider"); }
  };

  const handleEdit = async (data: Partial<ProviderConfig>) => {
    if (!editTarget) return;
    try {
      await api.updateProvider(editTarget.id, data);
      setEditTarget(null);
      refresh();
    } catch { showToast("Failed to update provider"); }
  };

  const handleDelete = async (p: ProviderConfig) => {
    try {
      await api.deleteProvider(p.id);
      refresh();
    } catch { showToast("Failed to delete provider"); }
  };

  const handleTest = async (p: ProviderConfig) => {
    showToast(t("prov.testing"));
    try {
      await api.testProvider(p.id);
      showToast(t("prov.test_ok"));
    } catch { showToast(t("prov.test_fail")); }
  };

  return (
    <PageLayout>
      <div className="flex flex-col gap-6 p-8">
        <PageHeader title={t("prov.title")} subtitle={t("prov.subtitle")} />

        {toast && (
          <div className="fixed top-4 right-4 bg-nuka-card border border-nuka-elevated rounded-xl px-4 py-2 text-sm text-white z-50">
            {toast}
          </div>
        )}

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
            <ProviderCard
              key={p.id}
              provider={p}
              onEdit={() => setEditTarget(p)}
              onDelete={() => handleDelete(p)}
              onTest={() => handleTest(p)}
            />
          ))}
        </div>
      </div>

      {showAdd && (
        <ProviderEditModal onSave={handleAdd} onCancel={() => setShowAdd(false)} />
      )}
      {editTarget && (
        <ProviderEditModal
          initial={editTarget}
          onSave={handleEdit}
          onCancel={() => setEditTarget(null)}
        />
      )}
    </PageLayout>
  );
}
