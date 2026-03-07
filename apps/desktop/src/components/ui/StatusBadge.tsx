import type { PropsWithChildren } from "react";

type StatusBadgeTone = "default" | "soft";

type StatusBadgeProps = PropsWithChildren<{
  tone?: StatusBadgeTone;
}>;

export function StatusBadge({ children, tone = "default" }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}
