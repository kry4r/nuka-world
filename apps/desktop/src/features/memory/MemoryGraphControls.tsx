type MemoryWorkbenchView = "activation" | "consolidation" | "schema";

type MemoryGraphControlsProps = {
  filterKind: string;
  searchQuery: string;
  selectedNodeTitle: string | null;
  viewMode: "focused" | "full";
  workbenchView: MemoryWorkbenchView;
  onFilterKindChange: (value: string) => void;
  onFitView: () => void;
  onFocusSelected: () => void;
  onSearchQueryChange: (value: string) => void;
  onViewModeChange: (value: "focused" | "full") => void;
  onWorkbenchViewChange: (value: MemoryWorkbenchView) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

export function MemoryGraphControls({
  filterKind,
  searchQuery,
  selectedNodeTitle,
  viewMode,
  workbenchView,
  onFilterKindChange,
  onFitView,
  onFocusSelected,
  onSearchQueryChange,
  onViewModeChange,
  onWorkbenchViewChange,
  onZoomIn,
  onZoomOut,
}: MemoryGraphControlsProps) {
  return (
    <div className="memory-controls">
      <div className="memory-controls__row">
        <label className="memory-controls__field memory-controls__field--search">
          <span className="memory-controls__label">Search</span>
          <input
            aria-label="Search graph"
            className="memory-controls__input"
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Find nodes by title or body"
            value={searchQuery}
          />
        </label>

        <label className="memory-controls__field">
          <span className="memory-controls__label">Kind</span>
          <select
            aria-label="Filter kind"
            className="memory-controls__select"
            onChange={(event) => onFilterKindChange(event.target.value)}
            value={filterKind}
          >
            <option value="all">All kinds</option>
            <option value="workflow">workflow</option>
            <option value="session">session</option>
            <option value="agent">agent</option>
            <option value="message">message</option>
            <option value="fact">fact</option>
          </select>
        </label>

        <label className="memory-controls__field">
          <span className="memory-controls__label">View</span>
          <select
            aria-label="View mode"
            className="memory-controls__select"
            onChange={(event) =>
              onViewModeChange(event.target.value === "full" ? "full" : "focused")
            }
            value={viewMode}
          >
            <option value="focused">Focused graph</option>
            <option value="full">Full map</option>
          </select>
        </label>
      </div>

      <div className="memory-controls__toolbar">
        <div className="memory-controls__group">
          <span className="memory-controls__label">Lens</span>
          <div className="memory-controls__chips">
            {[
              { label: "Activation", value: "activation" as const },
              { label: "Consolidation", value: "consolidation" as const },
              { label: "Schema", value: "schema" as const },
            ].map((option) => (
              <button
                aria-pressed={workbenchView === option.value}
                className={`memory-controls__chip${workbenchView === option.value ? " is-active" : ""}`}
                key={option.value}
                onClick={() => onWorkbenchViewChange(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="memory-controls__group memory-controls__group--actions">
          <span className="memory-controls__label">Viewport</span>
          <div className="memory-controls__chips">
            <button className="memory-controls__chip" onClick={onZoomOut} type="button">
              Zoom out
            </button>
            <button className="memory-controls__chip" onClick={onZoomIn} type="button">
              Zoom in
            </button>
            <button className="memory-controls__chip" onClick={onFitView} type="button">
              Fit graph
            </button>
            <button
              className="memory-controls__chip is-accent"
              disabled={!selectedNodeTitle}
              onClick={onFocusSelected}
              type="button"
            >
              Focus selection
            </button>
          </div>
        </div>
      </div>

      <div className="memory-controls__footer">
        <span className="memory-controls__focus-label">Focus target</span>
        <span className="memory-controls__focus-value">
          {selectedNodeTitle ?? "Select a node to focus the graph"}
        </span>
      </div>
    </div>
  );
}
