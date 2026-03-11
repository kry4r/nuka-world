import { getCurrentWindow } from "@tauri-apps/api/window";
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

function TitlebarIcon({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" className="app-titlebar__icon" viewBox="0 0 16 16">
      <path d={path} />
    </svg>
  );
}

export function AppShell({
  activePage,
  children,
  navigation,
  onNavigate,
  inspector,
}: AppShellProps) {
  const appWindow = getCurrentWindow();
  const handleTitlebarPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.closest(".app-titlebar__actions")) {
      return;
    }

    void appWindow.startDragging();
  };

  return (
    <div className="app-shell">
      <header
        className="app-titlebar app-shell__chrome-lock"
        data-testid="app-titlebar"
        onPointerDown={handleTitlebarPointerDown}
      >
        <div
          className="app-titlebar__drag app-titlebar__drag--overlay app-shell__chrome-lock"
          data-tauri-drag-region
        />
        <span className="app-titlebar__caption">Nuka World Desktop</span>
        <div className="app-titlebar__actions">
          <button
            aria-label="Minimize window"
            className="app-titlebar__button"
            onClick={() => void appWindow.minimize()}
            type="button"
          >
            <TitlebarIcon path="M3 8.5h10" />
          </button>
          <button
            aria-label="Maximize window"
            className="app-titlebar__button"
            onClick={() => void appWindow.toggleMaximize()}
            type="button"
          >
            <TitlebarIcon path="M4 4.5h8v7H4z" />
          </button>
          <button
            aria-label="Close window"
            className="app-titlebar__button app-titlebar__button--close"
            onClick={() => void appWindow.close()}
            type="button"
          >
            <TitlebarIcon path="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" />
          </button>
        </div>
      </header>

      <div className="app-shell__body">
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
    </div>
  );
}
