import { NukaLockup } from "@/components/brand/NukaLockup";

type SidebarItem = {
  id: string;
  label: string;
};

type SidebarProps = {
  activePage: string;
  navigation: SidebarItem[];
  onNavigate: (id: string) => void;
};

export function Sidebar({ activePage, navigation, onNavigate }: SidebarProps) {
  return (
    <aside className="app-sidebar">
      <button className="app-sidebar__brand" onClick={() => onNavigate("chat")} type="button">
        <NukaLockup className="app-sidebar__lockup" width={104} />
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
    </aside>
  );
}
