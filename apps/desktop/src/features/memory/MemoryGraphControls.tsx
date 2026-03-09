type MemoryGraphControlsProps = {
  edgesCount: number;
  filterKind: string;
  nodesCount: number;
  searchQuery: string;
  selectedNodeTitle: string | null;
  viewMode: "focused" | "full";
  onFilterKindChange: (value: string) => void;
  onFitView: () => void;
  onFocusSelected: () => void;
  onSearchQueryChange: (value: string) => void;
  zoom: number;
  onViewModeChange: (value: "focused" | "full") => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

export function MemoryGraphControls({
  edgesCount,
  filterKind,
  nodesCount,
  searchQuery,
  selectedNodeTitle,
  viewMode,
  onFilterKindChange,
  onFitView,
  onFocusSelected,
  onSearchQueryChange,
  onViewModeChange,
  zoom,
  onZoomIn,
  onZoomOut,
}: MemoryGraphControlsProps) {
  return (
    <div
      style={{
        display: "grid",
        gap: "1rem",
      }}
    >
      <div style={{ color: "rgba(248, 244, 236, 0.68)", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        <span>{nodesCount} nodes</span>
        <span>{edgesCount} edges</span>
        <span>{Math.round(zoom * 100)}% zoom</span>
      </div>

      <label style={{ display: "grid", gap: "0.35rem" }}>
        <span>Search</span>
        <input
          aria-label="Search graph"
          className="field-input"
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Find nodes by title or body"
          value={searchQuery}
        />
      </label>

      <label style={{ display: "grid", gap: "0.35rem" }}>
        <span>Filter</span>
        <select
          aria-label="Filter kind"
          className="settings-select"
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

      <label style={{ display: "grid", gap: "0.35rem" }}>
        <span>View mode</span>
        <select
          aria-label="View mode"
          className="settings-select"
          onChange={(event) =>
            onViewModeChange(event.target.value === "full" ? "full" : "focused")
          }
          value={viewMode}
        >
          <option value="focused">Focused graph</option>
          <option value="full">Full map</option>
        </select>
      </label>

      <div style={{ display: "grid", gap: "0.5rem" }}>
        <strong>Legend</strong>
        <div
          style={{
            color: "rgba(248, 244, 236, 0.68)",
            display: "grid",
            gap: "0.35rem",
          }}
        >
          <span>workflow: orchestration memory</span>
          <span>session: live work context</span>
          <span>fact: durable note or conclusion</span>
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.5rem" }}>
        <strong>Viewport</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button className="settings-panel__trigger" onClick={onZoomOut} type="button">
            Zoom out
          </button>
          <button className="settings-panel__trigger" onClick={onZoomIn} type="button">
            Zoom in
          </button>
          <button className="settings-panel__trigger" onClick={onFitView} type="button">
            Fit graph
          </button>
          <button
            className="composer__send"
            disabled={!selectedNodeTitle}
            onClick={onFocusSelected}
            type="button"
          >
            Focus selection
          </button>
        </div>
      </div>

      <div style={{ color: "rgba(248, 244, 236, 0.68)", display: "grid", gap: "0.35rem" }}>
        <strong>Focus target</strong>
        <span>{selectedNodeTitle ?? "Select a node to focus the graph"}</span>
      </div>
    </div>
  );
}
