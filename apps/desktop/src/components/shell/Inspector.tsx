import type { PropsWithChildren } from "react";

type InspectorProps = PropsWithChildren<{
  title: string;
  description: string;
  embedded?: boolean;
}>;

export function Inspector({ children, description, embedded = false, title }: InspectorProps) {
  const Tag = embedded ? "section" : "aside";

  return (
    <Tag
      aria-label={embedded ? undefined : title}
      className={`app-inspector${embedded ? " app-inspector--embedded" : ""}`}
      data-inspector-kind="contextual"
    >
      <div className="app-inspector__header">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="app-inspector__body">{children}</div>
    </Tag>
  );
}
