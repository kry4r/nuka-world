"use client";

import { useEffect, useState, useCallback } from "react";
import PageLayout from "@/components/PageLayout";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { A2ATask, A2ATaskDetail, A2AMessage } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-500/20 text-blue-400",
  planning: "bg-yellow-500/20 text-yellow-400",
  confirmed: "bg-purple-500/20 text-purple-400",
  working: "bg-nuka-orange/20 text-nuka-orange",
  completed: "bg-nuka-teal/20 text-nuka-teal",
  failed: "bg-red-500/20 text-red-400",
  canceled: "bg-nuka-muted/20 text-nuka-muted",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[status] || "bg-nuka-elevated text-nuka-muted"}`}>
      {status}
    </span>
  );
}

function TaskListItem({
  task,
  selected,
  onClick,
}: {
  task: A2ATask;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl transition-colors flex flex-col gap-2 ${
        selected ? "bg-nuka-elevated" : "hover:bg-nuka-elevated/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-white truncate flex-1">{task.description}</span>
        <StatusBadge status={task.status} />
      </div>
      <div className="flex items-center gap-2 text-xs text-nuka-muted">
        <span>{new Date(task.created_at).toLocaleDateString()}</span>
        {task.confirmed_agents?.length > 0 && (
          <span>· {task.confirmed_agents.length} agents</span>
        )}
      </div>
    </button>
  );
}

function TaskTimeline({ messages }: { messages: A2AMessage[] }) {
  if (!messages || messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-nuka-muted">
        No messages yet
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-3 p-4">
      {messages.map((msg) => (
        <div key={msg.id} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-nuka-placeholder flex items-center justify-center text-[10px] text-white">
              {msg.from_agent.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-bold text-white">{msg.from_agent}</span>
            <span className="text-[10px] text-nuka-muted">R{msg.round}</span>
          </div>
          <div className={`ml-8 text-sm rounded-xl p-3 ${
            msg.msg_type === "moderator"
              ? "bg-nuka-elevated/50 text-nuka-muted italic"
              : "bg-nuka-elevated text-white"
          }`}>
            {msg.content}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskDetailPanel({
  task,
  onConfirm,
  onCancel,
}: {
  task: A2ATask;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const canConfirm = task.status === "planning" || task.status === "submitted";
  const canCancel = task.status !== "completed" && task.status !== "canceled" && task.status !== "failed";

  return (
    <div className="w-[280px] min-w-[280px] bg-nuka-page border-l border-nuka-elevated flex flex-col gap-4 p-4 overflow-y-auto">
      <span className="font-[var(--font-oswald)] text-sm font-bold text-white">TASK DETAIL</span>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-nuka-muted">STATUS</span>
        <StatusBadge status={task.status} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-nuka-muted">DESCRIPTION</span>
        <span className="text-xs text-white">{task.description}</span>
      </div>

      {task.proposed_agents?.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-nuka-muted">{t("collab.proposed")}</span>
          <div className="flex flex-wrap gap-1">
            {task.proposed_agents.map((a) => (
              <span key={a} className="text-xs bg-nuka-elevated px-2 py-0.5 rounded text-white">{a}</span>
            ))}
          </div>
        </div>
      )}

      {task.confirmed_agents?.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-nuka-muted">{t("collab.confirmed")}</span>
          <div className="flex flex-wrap gap-1">
            {task.confirmed_agents.map((a) => (
              <span key={a} className="text-xs bg-nuka-teal/20 px-2 py-0.5 rounded text-nuka-teal">{a}</span>
            ))}
          </div>
        </div>
      )}

      {task.result && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-nuka-muted">{t("collab.result")}</span>
          <div className="text-xs text-white bg-nuka-elevated rounded-lg p-2 max-h-40 overflow-y-auto">
            {task.result}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 mt-auto">
        {canConfirm && (
          <button onClick={onConfirm}
            className="w-full text-sm bg-nuka-teal/20 text-nuka-teal rounded-lg py-2 hover:bg-nuka-teal/30 transition-colors">
            {t("collab.confirm")}
          </button>
        )}
        {canCancel && (
          <button onClick={onCancel}
            className="w-full text-sm bg-red-500/10 text-red-400 rounded-lg py-2 hover:bg-red-500/20 transition-colors">
            {t("collab.cancel_task")}
          </button>
        )}
      </div>
    </div>
  );
}

function CreateTaskModal({
  onSubmit,
  onCancel,
}: {
  onSubmit: (desc: string, rounds: number) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [desc, setDesc] = useState("");
  const [rounds, setRounds] = useState(10);

  const fc = "w-full bg-nuka-elevated rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-nuka-muted";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-nuka-card rounded-2xl p-6 w-[420px] flex flex-col gap-4">
        <span className="font-[var(--font-oswald)] text-lg font-bold text-white">
          {t("collab.create")}
        </span>
        <textarea
          className={`${fc} min-h-[80px] resize-none`}
          placeholder={t("collab.desc")}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <span className="text-xs text-nuka-muted">{t("collab.rounds")}</span>
          <input
            type="number"
            className={`${fc} w-20`}
            min={1}
            max={50}
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onCancel} className="text-sm text-nuka-muted hover:text-white transition-colors">
            {t("collab.cancel")}
          </button>
          <button
            onClick={() => desc.trim() && onSubmit(desc.trim(), rounds)}
            disabled={!desc.trim()}
            className="text-sm text-nuka-orange hover:text-white transition-colors disabled:opacity-50"
          >
            {t("collab.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CollaborationPage() {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<A2ATask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<A2ATaskDetail | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState("");

  const refresh = useCallback(() => {
    api.listA2ATasks().then((t) => setTasks(t || [])).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    api.getA2ATask(selectedId).then(setDetail).catch(() => setDetail(null));
  }, [selectedId]);

  // Poll for updates on working tasks
  useEffect(() => {
    if (!detail || detail.task.status !== "working") return;
    const iv = setInterval(() => {
      api.getA2ATask(detail.task.id).then(setDetail).catch(() => {});
      refresh();
    }, 3000);
    return () => clearInterval(iv);
  }, [detail, refresh]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleCreate = async (desc: string, rounds: number) => {
    try {
      const task = await api.createA2ATask(desc, rounds);
      setShowCreate(false);
      refresh();
      setSelectedId(task.id);
    } catch { showToast("Failed to create task"); }
  };

  const handleConfirm = async () => {
    if (!detail) return;
    try {
      await api.confirmA2ATask(detail.task.id);
      api.getA2ATask(detail.task.id).then(setDetail);
      refresh();
    } catch { showToast("Failed to confirm task"); }
  };

  const handleCancel = async () => {
    if (!detail) return;
    try {
      await api.cancelA2ATask(detail.task.id);
      api.getA2ATask(detail.task.id).then(setDetail);
      refresh();
    } catch { showToast("Failed to cancel task"); }
  };

  return (
    <PageLayout>
      <div className="flex flex-col h-full">
        <div className="p-8 pb-4">
          <PageHeader title={t("collab.title")} subtitle={t("collab.subtitle")} />
        </div>

        {toast && (
          <div className="fixed top-4 right-4 bg-nuka-card border border-nuka-elevated rounded-xl px-4 py-2 text-sm text-white z-50">
            {toast}
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          {/* Left: Task List */}
          <div className="w-[280px] min-w-[280px] border-r border-nuka-elevated flex flex-col">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-nuka-muted font-bold">TASKS</span>
              <button onClick={() => setShowCreate(true)}
                className="text-xs text-nuka-orange hover:text-white transition-colors">
                + {t("collab.create")}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 flex flex-col gap-1">
              {tasks.length === 0 && (
                <span className="text-sm text-nuka-muted p-4">{t("collab.no_tasks")}</span>
              )}
              {tasks.map((task) => (
                <TaskListItem key={task.id} task={task}
                  selected={task.id === selectedId}
                  onClick={() => setSelectedId(task.id)} />
              ))}
            </div>
          </div>

          {/* Center: Timeline */}
          <div className="flex-1 flex flex-col min-w-0">
            {detail ? (
              <TaskTimeline messages={detail.messages} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-nuka-muted">
                Select a task to view conversation
              </div>
            )}
          </div>

          {/* Right: Detail Panel */}
          {detail && (
            <TaskDetailPanel task={detail.task}
              onConfirm={handleConfirm} onCancel={handleCancel} />
          )}
        </div>
      </div>

      {showCreate && (
        <CreateTaskModal onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
      )}
    </PageLayout>
  );
}
