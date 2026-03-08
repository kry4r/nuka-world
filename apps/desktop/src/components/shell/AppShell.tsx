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
}>;

export function AppShell({ activePage, children, navigation, onNavigate }: AppShellProps) {
  return (
    <div className="app-shell">
      <div className="app-shell__body">
        <Sidebar activePage={activePage} navigation={navigation} onNavigate={onNavigate} />

        <div className="app-shell__content">
          <div className="app-shell__page" data-active-page={activePage} key={activePage}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
