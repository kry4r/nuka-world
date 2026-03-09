type StatusStripProps = {
  pageLabel: string;
  contextLabel?: string;
  runtimeLabel?: string;
};

export function StatusStrip({ pageLabel, contextLabel, runtimeLabel }: StatusStripProps) {
  return (
    <header className="status-strip" data-testid="status-strip">
      <div className="status-strip__section">
        <span className="status-strip__label">Workspace</span>
        <strong className="status-strip__value">{pageLabel}</strong>
      </div>
      {contextLabel ? (
        <div className="status-strip__section status-strip__section--context">
          <span className="status-strip__label">Focus</span>
          <span className="status-strip__value status-strip__value--muted">{contextLabel}</span>
        </div>
      ) : null}
      {runtimeLabel ? (
        <div className="status-strip__section status-strip__section--runtime">
          <span className="status-strip__label">Runtime</span>
          <span className="status-strip__value">{runtimeLabel}</span>
        </div>
      ) : null}
    </header>
  );
}
