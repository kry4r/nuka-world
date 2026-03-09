import { NukaLockup } from "@/components/brand/NukaLockup";
import type { ShellNavigationItem, ShellPageId } from "./shellNavigation";

type SidebarProps = {
  activePage: ShellPageId;
  navigation: ShellNavigationItem[];
  onNavigate: (id: ShellPageId) => void;
};

export function Sidebar({ activePage, navigation, onNavigate }: SidebarProps) {
  const primaryItems = navigation.filter((item) => item.id !== "settings");
  const settingsItem = navigation.find((item) => item.id === "settings");

  return (
    <aside aria-label="Primary" className="app-sidebar">
      <button aria-label="Open Chat" className="app-sidebar__brand" onClick={() => onNavigate("chat")} type="button">
        <NukaLockup className="app-sidebar__lockup" width={124} />
        <span className="app-sidebar__brand-copy">
          <span className="app-sidebar__brand-title">Nuka</span>
          <span className="app-sidebar__brand-meta">Desktop workbench</span>
        </span>
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

      <div className="app-sidebar__runtime" aria-label="Runtime summary">
        <span className="app-sidebar__runtime-label">Runtime</span>
        <strong>Local-first</strong>
        <span>Context stays on device until routed.</span>
      </div>

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
            <span className="app-sidebar__settings-meta">Providers, appearance, runtime</span>
          </span>
        </button>
      ) : null}
    </aside>
  );
}
