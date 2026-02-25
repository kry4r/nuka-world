"use client";

import type { Agent, Team } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

export type ChatMode = "agents" | "teams";

export default function ConversationList({
  agents,
  teams,
  mode,
  selected,
  onSelect,
  onModeChange,
}: {
  agents: Agent[];
  teams: Team[];
  mode: ChatMode;
  selected: string;
  onSelect: (id: string) => void;
  onModeChange: (m: ChatMode) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="w-[280px] min-w-[280px] bg-nuka-card flex flex-col gap-4 p-4 pt-6 h-full">
      <div className="flex items-center justify-between">
        <span className="font-[var(--font-oswald)] text-sm font-bold text-white">
          {t("chat.title")}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onModeChange("agents")}
          className={`text-xs pb-1 ${
            mode === "agents"
              ? "text-nuka-orange border-b border-nuka-orange"
              : "text-nuka-muted hover:text-white"
          }`}
        >
          {t("chat.agents")}
        </button>
        <button
          onClick={() => onModeChange("teams")}
          className={`text-xs pb-1 ${
            mode === "teams"
              ? "text-nuka-orange border-b border-nuka-orange"
              : "text-nuka-muted hover:text-white"
          }`}
        >
          {t("chat.teams")}
        </button>
      </div>

      <div className="flex flex-col gap-0.5 overflow-y-auto flex-1">
        {mode === "agents" && agents.map((a) => (
          <button
            key={a.persona.id}
            onClick={() => onSelect(a.persona.id)}
            className={`flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
              selected === a.persona.id ? "bg-nuka-elevated" : "hover:bg-nuka-elevated/50"
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-nuka-placeholder shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm text-white truncate">{a.persona?.name || a.persona.id}</span>
              <span className="text-xs text-nuka-muted truncate">{a.model}</span>
            </div>
          </button>
        ))}
        {mode === "agents" && agents.length === 0 && (
          <span className="text-xs text-nuka-muted p-3">{t("chat.no_agents")}</span>
        )}
        {mode === "teams" && teams.map((tm) => (
          <button
            key={tm.id}
            onClick={() => onSelect(tm.id)}
            className={`flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
              selected === tm.id ? "bg-nuka-elevated" : "hover:bg-nuka-elevated/50"
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-nuka-placeholder shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm text-white truncate">{tm.name}</span>
              <span className="text-xs text-nuka-muted truncate">{tm.strategy}</span>
            </div>
          </button>
        ))}
        {mode === "teams" && teams.length === 0 && (
          <span className="text-xs text-nuka-muted p-3">{t("chat.no_teams")}</span>
        )}
      </div>
    </div>
  );
}