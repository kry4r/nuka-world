import { StatusBadge } from "./StatusBadge";

type SectionHeaderProps = {
  tag: string;
  title: string;
  meta: string;
  status?: string;
};

export function SectionHeader({ meta, status, tag, title }: SectionHeaderProps) {
  return (
    <header className="section-header">
      <div className="section-header__copy">
        <h1 className="section-header__title">{title}</h1>
        <span className="section-header__meta">{meta}</span>
      </div>
      {status ? <StatusBadge className="section-header__status" tone="soft">{status}</StatusBadge> : null}
    </header>
  );
}
