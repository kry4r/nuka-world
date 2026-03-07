import type { PropsWithChildren } from "react";

type InspectorProps = PropsWithChildren<{
  title: string;
  description: string;
}>;

export function Inspector({ children, description, title }: InspectorProps) {
  return (
    <aside className="app-inspector">
      <div className="app-inspector__header">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="app-inspector__body">{children}</div>
    </aside>
  );
}
