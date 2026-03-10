import { useEffect, useState, type JSX } from "react";
import { AppShell } from "./components/shell/AppShell";
import type { ShellNavigationItem, ShellPageId } from "./components/shell/shellNavigation";
import { AgentsPage } from "./features/agents/AgentsPage";
import { ChatPage } from "./features/chat/ChatPage";
import { KnowledgePage } from "./features/knowledge/KnowledgePage";
import { MemoryPage } from "./features/memory/MemoryPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { WorkflowPage } from "./features/workflow/WorkflowPage";
import type { WorkflowLaunchIntent } from "./lib/workflow";

type AppPage = ShellPageId;

type AppPageDefinition = {
  label: string;
  render: () => JSX.Element;
};

export default function App() {
  const [activePage, setActivePage] = useState<AppPage>("chat");
  const [workflowIntent, setWorkflowIntent] = useState<WorkflowLaunchIntent | null>(null);

  useEffect(() => {
    const handleNavigation = (event: Event) => {
      const detail = (event as CustomEvent<{ page?: AppPage }>).detail;
      if (!detail?.page) {
        return;
      }

      setActivePage(detail.page);
    };

    window.addEventListener("nuka:navigate", handleNavigation as EventListener);

    return () => {
      window.removeEventListener("nuka:navigate", handleNavigation as EventListener);
    };
  }, []);

  const handleWorkflowHandoff = (handoff: WorkflowLaunchIntent) => {
    setWorkflowIntent(handoff);
    setActivePage("workflow");
  };

  const pageDefinitions: Record<AppPage, AppPageDefinition> = {
    chat: {
      label: "Chat",
      render: () => (
        <ChatPage
          onWorkflowHandoff={(handoff) => {
            handleWorkflowHandoff(handoff);
          }}
        />
      ),
    },
    workflow: {
      label: "Workflow",
      render: () => (
        <WorkflowPage
          intent={workflowIntent}
          onIntentHandled={() => {
            setWorkflowIntent(null);
          }}
        />
      ),
    },
    agents: {
      label: "Agents",
      render: () => <AgentsPage />,
    },
    memory: {
      label: "Memory",
      render: () => <MemoryPage />,
    },
    knowledge: {
      label: "Knowledge",
      render: () => <KnowledgePage />,
    },
    settings: {
      label: "Settings",
      render: () => <SettingsPage />,
    },
  };

  const navigation: ShellNavigationItem[] = (
    Object.entries(pageDefinitions) as Array<[AppPage, AppPageDefinition]>
  ).map(([id, definition]) => ({
    id,
    label: definition.label,
  }));
  const pageDefinition = pageDefinitions[activePage];
  const page = pageDefinition.render();

  return (
    <AppShell
      activePage={activePage}
      navigation={navigation}
      onNavigate={(page) => {
        if (page === "chat") {
          setActivePage("chat");
          return;
        }

        setActivePage(page);
      }}
    >
      {page}
    </AppShell>
  );
}
