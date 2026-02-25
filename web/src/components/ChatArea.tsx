"use client";

import type { RefObject } from "react";
import { useI18n } from "@/lib/i18n";

interface ChatMsg {
  role: "user" | "agent";
  content: string;
  agentName?: string;
}

function MessageBubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm ${
        isUser ? "bg-nuka-orange text-white" : "bg-nuka-card text-white"
      }`}>
        {!isUser && msg.agentName && (
          <div className="text-xs text-nuka-teal mb-1">{msg.agentName}</div>
        )}
        <div className="whitespace-pre-wrap">{msg.content}</div>
      </div>
    </div>
  );
}

export default function ChatArea({
  agentName,
  messages,
  input,
  loading,
  onInputChange,
  onSend,
  bottomRef,
}: {
  agentName: string;
  messages: ChatMsg[];
  input: string;
  loading: boolean;
  onInputChange: (v: string) => void;
  onSend: () => void;
  bottomRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useI18n();

  return (
    <div className="flex-1 flex flex-col justify-between h-full p-6 px-8">
      <div className="flex items-center justify-between pb-4 border-b border-nuka-placeholder/30">
        <span className="font-[var(--font-oswald)] text-lg font-bold text-white">
          {agentName || t("chat.select")}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-5 py-4">
        {messages.map((m, i) => (
          <MessageBubble key={i} msg={m} />
        ))}
        {loading && (
          <div className="text-xs text-nuka-muted animate-pulse">
            {t("chat.thinking")}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center bg-nuka-card rounded-2xl h-12 px-5 gap-3">
        <input
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-nuka-muted"
          placeholder={t("chat.placeholder")}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          disabled={loading}
        />
        <button
          onClick={onSend}
          disabled={loading}
          className="text-nuka-orange text-sm hover:text-white transition-colors disabled:opacity-50"
        >
          {t("chat.send")}
        </button>
      </div>
    </div>
  );
}
