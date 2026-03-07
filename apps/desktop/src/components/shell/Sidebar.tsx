import { NukaLogo } from "@/components/brand/NukaLogo";

type SidebarItem = {
  id: string;
  label: string;
};

type SidebarProps = {
  activePage: string;
  collapsed: boolean;
  navigation: SidebarItem[];
  onNavigate: (id: string) => void;
  onToggle: () => void;
  settingsItem: SidebarItem;
};

function itemLabel(item: SidebarItem, collapsed: boolean) {
  return collapsed ? item.label.slice(0, 1) : item.label;
}

export function Sidebar({
  activePage,
  collapsed,
  navigation,
  onNavigate,
  onToggle,
  settingsItem,
}: SidebarProps) {
  return (
    <aside className={`app-sidebar${collapsed ? " is-collapsed" : ""}`}>
      <div className="app-sidebar__top">
        <button className="app-sidebar__brand" onClick={() => onNavigate("chat")} type="button">
          <NukaLogo className="app-sidebar__logo" size={22} />
          {collapsed ? null : <span>Nuka</span>}
        </button>
        <button className="app-sidebar__toggle" onClick={onToggle} type="button">
          {collapsed ? "→" : "←"}
        </button>
      </div>

      <nav className="app-sidebar__nav">
        {navigation.map((item) => {
          const active = activePage === item.id;

          return (
            <button
              aria-label={item.label}
              className={`app-sidebar__nav-item${active ? " is-active" : ""}`}
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={item.label}
              type="button"
            >
              <span className="app-sidebar__nav-rail" />
              <span>{itemLabel(item, collapsed)}</span>
            </button>
          );
        })}
      </nav>

      <div className="app-sidebar__footer">
        <button
          aria-label={settingsItem.label}
          className={`app-sidebar__settings${activePage === settingsItem.id ? " is-active" : ""}`}
          onClick={() => onNavigate(settingsItem.id)}
          title={settingsItem.label}
          type="button"
        >
          <span className="app-sidebar__settings-title">{itemLabel(settingsItem, collapsed)}</span>
          {collapsed ? null : <span className="app-sidebar__settings-meta">Providers · App · Runtime</span>}
        </button>
      </div>
    </aside>
  );
}
