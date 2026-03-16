import { useEffect, useState, type JSX } from "react";
import { AppShell } from "./components/shell/AppShell";
import type { ShellNavigationItem, ShellPageId } from "./components/shell/shellNavigation";
import { AgentsPage } from "./features/agents/AgentsPage";
import { ChatPage } from "./features/chat/ChatPage";
import { KnowledgePage } from "./features/knowledge/KnowledgePage";
import { MemoryPage } from "./features/memory/MemoryPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { TeamPage } from "./features/team/TeamPage";
import { useI18n } from "./lib/i18n";

type AppPage = ShellPageId;

type AppPageDefinition = {
  label: string;
  render: () => JSX.Element;
};

export default function App() {
  const [activePage, setActivePage] = useState<AppPage>("chat");
  const { t } = useI18n();

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

  const pageDefinitions: Record<AppPage, AppPageDefinition> = {
    chat: {
      label: t("nav.chat"),
      render: () => <ChatPage />,
    },
    team: {
      label: t("nav.team"),
      render: () => <TeamPage />,
    },
    agents: {
      label: t("nav.agents"),
      render: () => <AgentsPage />,
    },
    memory: {
      label: t("nav.memory"),
      render: () => <MemoryPage />,
    },
    knowledge: {
      label: t("nav.knowledge"),
      render: () => <KnowledgePage />,
    },
    settings: {
      label: t("nav.settings"),
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
        setActivePage(page);
      }}
    >
      {page}
    </AppShell>
  );
}
