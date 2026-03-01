"use client";

import { useEffect, useState, useRef } from "react";
import PageLayout from "@/components/PageLayout";
import ConversationList, { type ChatMode } from "@/components/ConversationList";
import ChatArea from "@/components/ChatArea";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Agent, Team, ExecuteResult } from "@/lib/types";

interface ChatMsg {
  role: "user" | "agent";
  content: string;
  agentName?: string;
}

export default function ChatPage() {
  const { t } = useI18n();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [mode, setMode] = useState<ChatMode>("agents");
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listAgents().then((list) => {
      const agents = list || [];
      setAgents(agents);
      if (agents.length > 0) setSelected(agents[0].persona.id);
    }).catch(() => {});
    api.listTeams().then((t) => setTeams(t || [])).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleModeChange = (m: ChatMode) => {
    setMode(m);
    setMessages([]);
    if (m === "agents" && agents.length > 0) setSelected(agents[0].persona.id);
    else if (m === "teams" && teams.length > 0) setSelected(teams[0].id);
    else setSelected("");
  };

  const send = async () => {
    if (!input.trim() || !selected) return;
    const msg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    try {
      let result: ExecuteResult;
      if (mode === "agents") {
        result = await api.chatWithAgent(selected, msg);
        const agent = agents.find((a) => a.persona.id === selected);
        setMessages((prev) => [...prev, { role: "agent", content: result.content, agentName: agent?.persona?.name }]);
      } else {
        result = await api.chatWithTeam(selected, msg);
        const team = teams.find((tm) => tm.id === selected);
        setMessages((prev) => [...prev, { role: "agent", content: result.content, agentName: team?.name }]);
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "Unknown error";
      setMessages((prev) => [...prev, { role: "agent", content: `Error: ${errMsg}` }]);
    }
    setLoading(false);
  };

  const selectedName = mode === "agents"
    ? agents.find((a) => a.persona.id === selected)?.persona?.name || selected
    : teams.find((tm) => tm.id === selected)?.name || selected;

  return (
    <PageLayout>
      <div className="flex h-screen">
        <ConversationList
          agents={agents}
          teams={teams}
          mode={mode}
          selected={selected}
          onSelect={setSelected}
          onModeChange={handleModeChange}
        />
        <ChatArea
          agentName={selectedName}
          messages={messages}
          input={input}
          loading={loading}
          onInputChange={setInput}
          onSend={send}
          bottomRef={bottomRef}
        />
      </div>
    </PageLayout>
  );
}
