import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { normalizeToast, subscribeToToasts, type ToastRecord } from "@/lib/toast";
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
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timeoutIdsRef = useRef<number[]>([]);

  useEffect(() => {
    const removeToast = (toastId: string) => {
      setToasts((current) => current.filter((toast) => toast.id !== toastId));
    };

    const unsubscribe = subscribeToToasts((input) => {
      const toast = normalizeToast(input);
      setToasts((current) => [...current, toast]);

      if (toast.durationMs <= 0) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        removeToast(toast.id);
        timeoutIdsRef.current = timeoutIdsRef.current.filter((id) => id !== timeoutId);
      }, toast.durationMs);

      timeoutIdsRef.current.push(timeoutId);
    });

    return () => {
      unsubscribe();
      timeoutIdsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      timeoutIdsRef.current = [];
    };
  }, []);

  const handleWindowDragPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    void appWindow.startDragging();
  };

  return (
    <div className="app-shell">
      <div className="app-window-chrome" data-testid="app-window-chrome">
        <div
          className="app-window-drag-region app-shell__chrome-lock"
          data-tauri-drag-region
          onPointerDown={handleWindowDragPointerDown}
        />
        <div
          className="app-window-controls app-shell__chrome-lock"
          data-testid="app-window-controls"
        >
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
      </div>

      <div className="app-shell__body">
        <Sidebar activePage={activePage} navigation={navigation} onNavigate={onNavigate} />

        <div className="app-shell__workspace app-shell__workspace--chrome-safe">
          <PageSurface activePage={activePage}>{children}</PageSurface>
          {inspector ? (
            <aside aria-label="Workspace inspector" className="app-shell__inspector">
              {inspector}
            </aside>
          ) : null}
        </div>
      </div>

      {toasts.length > 0 ? (
        <div aria-live="polite" className="app-toast-viewport" data-testid="app-toast-viewport">
          {toasts.map((toast) => (
            <section
              className={`app-toast app-toast--${toast.tone}`}
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
            >
              <span className="app-toast__message">{toast.message}</span>
              <button
                aria-label="Dismiss notification"
                className="app-toast__dismiss"
                onClick={() => {
                  setToasts((current) => current.filter((item) => item.id !== toast.id));
                }}
                type="button"
              >
                ×
              </button>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
