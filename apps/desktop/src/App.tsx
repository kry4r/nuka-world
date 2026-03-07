import { useMemo, useState } from "react";
import { AppShell } from "./components/shell/AppShell";
import { AgentsPage } from "./features/agents/AgentsPage";
import { ChatPage } from "./features/chat/ChatPage";
import { KnowledgePage } from "./features/knowledge/KnowledgePage";
import { MemoryPage } from "./features/memory/MemoryPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { WorkflowPage } from "./features/workflow/WorkflowPage";

type AppPage = "chat" | "workflow" | "agents" | "memory" | "knowledge" | "settings";

const PRIMARY_NAVIGATION: Array<{ id: AppPage; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "workflow", label: "Workflow" },
  { id: "agents", label: "Agents" },
  { id: "memory", label: "Memory" },
  { id: "knowledge", label: "Knowledge" },
];

const SETTINGS_ITEM = { id: "settings" as const, label: "Settings" };

export default function App() {
  const [activePage, setActivePage] = useState<AppPage>("chat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const page = useMemo(() => {
    switch (activePage) {
      case "chat":
        return <ChatPage />;
      case "workflow":
        return <WorkflowPage />;
      case "agents":
        return <AgentsPage />;
      case "memory":
        return <MemoryPage />;
      case "knowledge":
        return <KnowledgePage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <ChatPage />;
    }
  }, [activePage]);

  return (
    <AppShell
      activePage={activePage}
      navigation={PRIMARY_NAVIGATION}
      onNavigate={(id) => setActivePage(id as AppPage)}
      onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
      settingsItem={SETTINGS_ITEM}
      sidebarCollapsed={sidebarCollapsed}
    >
      {page}
    </AppShell>
  );
}
