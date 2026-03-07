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
        <div className="section-header__row">
          <StatusBadge>{tag}</StatusBadge>
          <span className="section-header__meta">{meta}</span>
        </div>
        <h1 className="section-header__title">{title}</h1>
      </div>
      {status ? <StatusBadge tone="soft">{status}</StatusBadge> : null}
    </header>
  );
}
