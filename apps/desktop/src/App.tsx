import { useEffect, useState, type JSX } from "react";
import { AppShell } from "./components/shell/AppShell";
import type { ShellNavigationItem, ShellPageId } from "./components/shell/shellNavigation";
import { Card } from "./components/ui/Card";
import { AgentsPage } from "./features/agents/AgentsPage";
import { ChatPage } from "./features/chat/ChatPage";
import { KnowledgePage } from "./features/knowledge/KnowledgePage";
import { MemoryPage } from "./features/memory/MemoryPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { WorkflowPage } from "./features/workflow/WorkflowPage";
import { Inspector } from "./components/shell/Inspector";
import type { WorkflowLaunchIntent } from "./lib/workflow";
import { useAppRuntimeStatus, type RuntimeStatus } from "./hooks/useAppRuntimeStatus";

type AppPage = ShellPageId;

type AppPageDefinition = {
  label: string;
  contextLabel: string;
  runtimeLabel: string;
  render: () => JSX.Element;
};

function runtimeLabelForPage(
  page: AppPage,
  fallback: string,
  runtimeStatus: RuntimeStatus | null,
  runtimeError: string | null,
) {
  if (runtimeError) {
    return "Runtime degraded";
  }

  if (!runtimeStatus) {
    return fallback;
  }

  switch (page) {
    case "chat":
    case "workflow":
    case "agents":
      return runtimeStatus.provider.message;
    case "knowledge":
      return runtimeStatus.knowledge.message;
    case "memory":
    case "settings":
      return runtimeStatus.app.message;
    default:
      return fallback;
  }
}

export default function App() {
  const [activePage, setActivePage] = useState<AppPage>("chat");
  const [workflowIntent, setWorkflowIntent] = useState<WorkflowLaunchIntent | null>(null);
  const { error: runtimeError, status: runtimeStatus } = useAppRuntimeStatus();

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
      contextLabel: "World chat is the front door for new work.",
      runtimeLabel: "Local-first runtime",
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
      contextLabel: "Structured sessions move into workflow rooms.",
      runtimeLabel: "Workflow state ready",
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
      contextLabel: "Saved agents, drafts, and tool policy live here.",
      runtimeLabel: "Agent registry synced",
      render: () => <AgentsPage />,
    },
    memory: {
      label: "Memory",
      contextLabel: "Graph workbench for nodes, relations, and context.",
      runtimeLabel: "Memory graph available",
      render: () => <MemoryPage />,
    },
    knowledge: {
      label: "Knowledge",
      contextLabel: "Libraries, sources, jobs, and engines share one workbench.",
      runtimeLabel: "Knowledge index idle",
      render: () => <KnowledgePage />,
    },
    settings: {
      label: "Settings",
      contextLabel: "Providers, appearance, and runtime controls stay in one place.",
      runtimeLabel: "Settings stored locally",
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
  const runtimeLabel = runtimeLabelForPage(
    activePage,
    pageDefinition.runtimeLabel,
    runtimeStatus,
    runtimeError,
  );
  const pageLabel = pageDefinition.label;
  const shellInspector =
    activePage === "settings" ? (
      <Inspector description={pageDefinition.contextLabel} embedded title="Workspace Guide">
        <Card description={pageLabel} title="Current Page" />
        <Card description={runtimeLabel} title="Runtime" tone="soft" />
        <Card description="Contextual utility panel" title="Role" tone="soft" />
      </Inspector>
    ) : null;
  const page = pageDefinition.render();

  return (
    <AppShell
      activePage={activePage}
      contextLabel={pageDefinition.contextLabel}
      inspector={shellInspector}
      navigation={navigation}
      onNavigate={(page) => {
        if (page === "chat") {
          setActivePage("chat");
          return;
        }

        setActivePage(page);
      }}
      pageLabel={pageLabel}
      runtimeLabel={runtimeLabel}
    >
      {page}
    </AppShell>
  );
}
