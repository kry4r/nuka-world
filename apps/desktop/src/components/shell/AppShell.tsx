import type { PropsWithChildren, ReactNode } from "react";
import { PageSurface } from "./PageSurface";
import { Sidebar } from "./Sidebar";
import type { ShellNavigationItem, ShellPageId } from "./shellNavigation";

type AppShellProps = PropsWithChildren<{
  activePage: ShellPageId;
  navigation: ShellNavigationItem[];
  onNavigate: (id: ShellPageId) => void;
  inspector?: ReactNode;
}>;

export function AppShell({
  activePage,
  children,
  navigation,
  onNavigate,
  inspector,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} navigation={navigation} onNavigate={onNavigate} />

      <div className="app-shell__workspace">
        <PageSurface activePage={activePage}>{children}</PageSurface>
        {inspector ? (
          <aside aria-label="Workspace inspector" className="app-shell__inspector">
            {inspector}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
