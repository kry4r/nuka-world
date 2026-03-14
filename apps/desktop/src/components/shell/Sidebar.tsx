import { NukaLogo } from "@/components/brand/NukaLogo";
import { useAppRuntimeStatus } from "@/hooks/useAppRuntimeStatus";
import type { ShellNavigationItem, ShellPageId } from "./shellNavigation";

type SidebarProps = {
  activePage: ShellPageId;
  navigation: ShellNavigationItem[];
  onNavigate: (id: ShellPageId) => void;
};

const NAVIGATION_ICON_PATHS: Record<ShellPageId, string[]> = {
  agents: ["M3.5 12.5c.8-1.9 2.4-3 4.5-3s3.7 1.1 4.5 3", "M8 8a2.25 2.25 0 1 0 0-4.5A2.25 2.25 0 0 0 8 8Z"],
  chat: ["M3.5 4.5h9v6h-5l-2.5 2v-2H3.5z"],
  knowledge: ["M4 3.5h7l1.5 1.5v7H4z", "M6 6.5h4", "M6 9h3"],
  memory: ["M4 5.5h8", "M4 8h8", "M4 10.5h5"],
  settings: ["M8 4.25v-1", "M8 12.75v-1", "M11.18 5.57l.7-.7", "M4.12 12.63l.7-.7", "M11.75 8h1", "M3.25 8h1", "M11.18 10.43l.7.7", "M4.12 3.37l.7.7", "M8 10.25A2.25 2.25 0 1 0 8 5.75a2.25 2.25 0 0 0 0 4.5Z"],
  team: ["M3.75 11.75c.6-1.6 1.9-2.5 3.6-2.5 1.1 0 2 .3 2.8.95", "M10.75 10.25c1.1 0 1.95.6 2.5 1.5", "M6.75 6.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z", "M11 7.25a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"],
};

function SidebarIcon({ page }: { page: ShellPageId }) {
  const paths = NAVIGATION_ICON_PATHS[page];

  return (
    <span aria-hidden="true" className="app-sidebar__nav-icon">
      <svg className="app-sidebar__nav-glyph" viewBox="0 0 16 16">
        {paths.map((path) => (
          <path d={path} key={path} />
        ))}
      </svg>
    </span>
  );
}

export function Sidebar({ activePage, navigation, onNavigate }: SidebarProps) {
  const { error, status } = useAppRuntimeStatus();
  const primaryItems = navigation.filter((item) => item.id !== "settings");
  const settingsItem = navigation.find((item) => item.id === "settings");
  const provider = status?.provider;
  const providerKind = error ? "degraded" : provider?.kind ?? "checking";
  const providerLabel =
    providerKind === "ready"
      ? (provider?.label ?? "Configured provider")
      : providerKind === "missing"
        ? "No provider configured"
        : providerKind === "checking"
          ? "Checking provider status"
          : "Provider unavailable";
  const providerStatusClass =
    providerKind === "ready"
      ? "is-ready"
      : providerKind === "missing"
        ? "is-warning"
        : "is-muted";

  return (
    <aside aria-label="Primary" className="app-sidebar app-shell__chrome-lock">
      <div className="app-sidebar__brand app-shell__chrome-lock">
        <NukaLogo className="app-sidebar__logo" size={124} />
      </div>

      <nav aria-label="Primary pages" className="app-sidebar__nav">
        {primaryItems.map((item) => {
          const active = activePage === item.id;

          return (
            <button
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={`app-sidebar__nav-item${active ? " is-active" : ""}`}
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={item.label}
              type="button"
            >
              <span className="app-sidebar__nav-rail" />
              <SidebarIcon page={item.id} />
              <span className="app-sidebar__nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <section
        className="app-sidebar__provider-card app-shell__chrome-lock"
        data-testid="sidebar-provider-card"
      >
        <div className="app-sidebar__provider-card-header">
          <div className="app-sidebar__provider-name">{providerLabel}</div>
          <span
            aria-hidden="true"
            className={`app-sidebar__provider-status-dot ${providerStatusClass}`}
          />
        </div>
        <button
          className="app-sidebar__provider-action"
          onClick={() => onNavigate("settings")}
          type="button"
        >
          Open Settings
        </button>
      </section>

      {settingsItem ? (
        <button
          aria-label={settingsItem.label}
          aria-current={activePage === settingsItem.id ? "page" : undefined}
          className={`app-sidebar__settings${activePage === settingsItem.id ? " is-active" : ""}`}
          onClick={() => onNavigate(settingsItem.id)}
          type="button"
        >
          <span className="app-sidebar__nav-rail" />
          <SidebarIcon page={settingsItem.id} />
          <span className="app-sidebar__settings-copy">
            <span className="app-sidebar__settings-title">{settingsItem.label}</span>
          </span>
        </button>
      ) : null}
    </aside>
  );
}
