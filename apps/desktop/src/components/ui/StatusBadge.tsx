import type { HTMLAttributes, PropsWithChildren } from "react";

type StatusBadgeTone = "default" | "soft" | "accent" | "warning";

type StatusBadgeProps = PropsWithChildren<{
  tone?: StatusBadgeTone;
}> &
  HTMLAttributes<HTMLSpanElement>;

export function StatusBadge({
  children,
  className,
  tone = "default",
  ...props
}: StatusBadgeProps) {
  const classes = ["status-badge", `status-badge--${tone}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
}
