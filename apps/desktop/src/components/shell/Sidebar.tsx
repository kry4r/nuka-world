import { NukaLogo } from "@/components/brand/NukaLogo";
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
        <NukaLogo className="app-sidebar__logo" size={56} />
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
