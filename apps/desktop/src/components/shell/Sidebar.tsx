import { NukaLogo } from "@/components/brand/NukaLogo";

type SidebarItem = {
  id: string;
  label: string;
};

type SidebarProps = {
  activePage: string;
  navigation: SidebarItem[];
  footerItem?: SidebarItem;
  onNavigate: (id: string) => void;
};

export function Sidebar({ activePage, footerItem, navigation, onNavigate }: SidebarProps) {
  return (
    <aside className="app-sidebar">
      <button aria-label="Open Chat" className="app-sidebar__brand" onClick={() => onNavigate("chat")} type="button">
        <NukaLogo className="app-sidebar__logo" size={24} />
      </button>

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
              <span className="app-sidebar__nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {footerItem ? (
        <div className="app-sidebar__footer">
          <button
            aria-label={footerItem.label}
            className={`app-sidebar__nav-item app-sidebar__nav-item--footer${activePage === footerItem.id ? " is-active" : ""}`}
            onClick={() => onNavigate(footerItem.id)}
            title={footerItem.label}
            type="button"
          >
            <span className="app-sidebar__nav-rail" />
            <span className="app-sidebar__nav-label">{footerItem.label}</span>
          </button>
        </div>
      ) : null}
    </aside>
  );
}
