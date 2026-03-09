import type { PropsWithChildren } from "react";

type PageSurfaceProps = PropsWithChildren<{
  activePage: string;
}>;

export function PageSurface({ activePage, children }: PageSurfaceProps) {
  return (
    <main className="page-surface">
      <div className="app-shell__page" data-active-page={activePage} key={activePage}>
        {children}
      </div>
    </main>
  );
}
