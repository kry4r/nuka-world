import { NukaLogo } from "@/components/brand/NukaLogo";
import { useAppRuntimeStatus } from "@/hooks/useAppRuntimeStatus";
import type { ShellNavigationItem, ShellPageId } from "./shellNavigation";

type SidebarProps = {
  activePage: ShellPageId;
  navigation: ShellNavigationItem[];
  onNavigate: (id: ShellPageId) => void;
};

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
  const providerMessage =
    providerKind === "ready"
      ? "Ready for chat and team runs."
      : providerKind === "missing"
        ? null
        : providerKind === "checking"
          ? "Checking current runtime status."
          : (provider?.message ?? "Open settings to review the current provider.");
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
          <span className="app-sidebar__provider-eyebrow">Provider</span>
          <span
            aria-hidden="true"
            className={`app-sidebar__provider-status-dot ${providerStatusClass}`}
          />
        </div>
        <div className="app-sidebar__provider-name">{providerLabel}</div>
        {providerMessage ? (
          <p className="app-sidebar__provider-message">{providerMessage}</p>
        ) : null}
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
          <span className="app-sidebar__settings-copy">
            <span className="app-sidebar__settings-title">{settingsItem.label}</span>
          </span>
        </button>
      ) : null}
    </aside>
  );
}
