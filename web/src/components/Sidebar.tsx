"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

const NAV_ITEMS = [
  { key: "nav.dashboard", href: "/" },
  { key: "nav.residents", href: "/residents" },
  { key: "nav.chat", href: "/chat" },
  { key: "nav.memory", href: "/memory" },
  { key: "nav.teams", href: "/teams" },
  { key: "nav.collaboration", href: "/collaboration" },
  { key: "nav.providers", href: "/providers" },
  { key: "nav.gateway", href: "/gateway" },
  { key: "nav.skills", href: "/skills" },
  { key: "nav.mcp", href: "/mcp" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <aside className="w-[220px] min-w-[220px] h-screen bg-nuka-page flex flex-col justify-between p-6">
      <div className="flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-nuka-orange" />
          <span className="font-[var(--font-oswald)] text-lg font-bold text-white tracking-wide">
            NUKA WORLD
          </span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 h-10 text-[13px] font-[var(--font-jetbrains)] no-underline transition-colors ${
                  active
                    ? "text-nuka-orange font-bold"
                    : "text-nuka-muted hover:text-white"
                }`}
              >
                <div
                  className={`w-1 h-4 rounded-sm ${
                    active ? "bg-nuka-orange" : "bg-nuka-placeholder"
                  }`}
                />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-4">
        <div className="bg-nuka-elevated rounded-2xl p-4 flex flex-col gap-2">
          <span className="text-xs text-nuka-muted">SYSTEM</span>
          <span className="text-xs text-nuka-teal">● Online</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-nuka-placeholder" />
          <span className="text-xs text-nuka-muted">admin</span>
        </div>
      </div>
    </aside>
  );
}
