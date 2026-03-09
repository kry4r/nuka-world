import type { PropsWithChildren, ReactNode } from "react";
import { PageSurface } from "./PageSurface";
import { Sidebar } from "./Sidebar";
import { StatusStrip } from "./StatusStrip";
import type { ShellNavigationItem, ShellPageId } from "./shellNavigation";

type AppShellProps = PropsWithChildren<{
  activePage: ShellPageId;
  contextLabel?: string;
  inspector?: ReactNode;
  navigation: ShellNavigationItem[];
  onNavigate: (id: ShellPageId) => void;
  pageLabel: string;
  runtimeLabel?: string;
}>;

export function AppShell({
  activePage,
  children,
  contextLabel,
  inspector,
  navigation,
  onNavigate,
  pageLabel,
  runtimeLabel,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} navigation={navigation} onNavigate={onNavigate} />

      <div className="app-shell__workspace">
        <StatusStrip contextLabel={contextLabel} pageLabel={pageLabel} runtimeLabel={runtimeLabel} />
        <div className="app-shell__frame" data-inspector-state={inspector ? "open" : "closed"}>
          <PageSurface activePage={activePage}>{children}</PageSurface>
          <aside
            aria-label="Workspace inspector"
            aria-hidden={inspector ? undefined : true}
            className="app-shell__inspector"
            data-inspector-state={inspector ? "open" : "closed"}
          >
            {inspector}
          </aside>
        </div>
      </div>
    </div>
  );
}
