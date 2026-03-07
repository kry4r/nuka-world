import type { PropsWithChildren } from "react";
import { Sidebar } from "./Sidebar";

type NavigationItem = {
  id: string;
  label: string;
};

type AppShellProps = PropsWithChildren<{
  activePage: string;
  navigation: NavigationItem[];
  onNavigate: (id: string) => void;
  onToggleSidebar: () => void;
  settingsItem: NavigationItem;
  sidebarCollapsed: boolean;
}>;

export function AppShell({
  activePage,
  children,
  navigation,
  onNavigate,
  onToggleSidebar,
  settingsItem,
  sidebarCollapsed,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <div className="app-shell__chrome">
        <div className="window-controls" aria-hidden="true">
          <span className="window-controls__dot" />
          <span className="window-controls__dot" />
          <span className="window-controls__dot" />
        </div>
        <span className="app-shell__chrome-label">Nuka World Desktop</span>
      </div>

      <div className="app-shell__body">
        <Sidebar
          activePage={activePage}
          collapsed={sidebarCollapsed}
          navigation={navigation}
          onNavigate={onNavigate}
          onToggle={onToggleSidebar}
          settingsItem={settingsItem}
        />

        <div className="app-shell__content">{children}</div>
      </div>
    </div>
  );
}
