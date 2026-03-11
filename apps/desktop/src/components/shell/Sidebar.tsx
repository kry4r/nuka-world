import { NukaLogo } from "@/components/brand/NukaLogo";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
    provider?.label ?? (providerKind === "ready" ? "Configured provider" : "No default provider");
  const providerMessage =
    provider?.message ?? (error ? "Provider unavailable" : "Checking provider status");
  const providerBadgeTone =
    providerKind === "ready" ? "accent" : providerKind === "missing" ? "warning" : "soft";
  const providerBadgeLabel =
    providerKind === "ready"
      ? "Configured"
      : providerKind === "missing"
        ? "Required"
        : providerKind === "checking"
          ? "Checking"
          : "Issue";

  return (
    <aside aria-label="Primary" className="app-sidebar">
      <button aria-label="Open Chat" className="app-sidebar__brand" onClick={() => onNavigate("chat")} type="button">
        <NukaLogo className="app-sidebar__logo" size={124} />
      </button>

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

      <section className="app-sidebar__provider-card" data-testid="sidebar-provider-card">
        <div className="app-sidebar__provider-card-header">
          <span className="app-sidebar__provider-eyebrow">Runtime</span>
          <StatusBadge tone={providerBadgeTone}>{providerBadgeLabel}</StatusBadge>
        </div>
        <div className="app-sidebar__provider-title">Current Provider</div>
        <div className="app-sidebar__provider-name">{providerLabel}</div>
        <p className="app-sidebar__provider-message">{providerMessage}</p>
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
