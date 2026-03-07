import type { PropsWithChildren, ReactNode } from "react";

type CardTone = "default" | "soft" | "accent";

type CardProps = PropsWithChildren<{
  title?: ReactNode;
  description?: ReactNode;
  className?: string;
  tone?: CardTone;
}>;

export function Card({
  children,
  className,
  description,
  title,
  tone = "default",
}: CardProps) {
  const classes = ["ui-card", `ui-card--${tone}`, className].filter(Boolean).join(" ");

  return (
    <section className={classes}>
      {title ? <h3 className="ui-card__title">{title}</h3> : null}
      {description ? <p className="ui-card__description">{description}</p> : null}
      {children}
    </section>
  );
}
