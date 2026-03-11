type MemoryGraphControlsProps = {
  filterKind: string;
  searchQuery: string;
  scopeOptions: Array<{
    id: string;
    label: string;
  }>;
  selectedScopeId: string;
  onFilterKindChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
  onScopeIdChange: (value: string) => void;
};

export function MemoryGraphControls({
  filterKind,
  scopeOptions,
  searchQuery,
  selectedScopeId,
  onFilterKindChange,
  onSearchQueryChange,
  onScopeIdChange,
}: MemoryGraphControlsProps) {
  return (
    <div className="memory-controls">
      <div className="memory-controls__row">
        <label className="memory-controls__field">
          <span className="memory-controls__label">Scope</span>
          <select
            aria-label="Memory scope"
            className="memory-controls__select"
            onChange={(event) => onScopeIdChange(event.target.value)}
            value={selectedScopeId}
          >
            {scopeOptions.map((scope) => (
              <option key={scope.id} value={scope.id}>
                {scope.label}
              </option>
            ))}
          </select>
        </label>

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
      </div>
    </div>
  );
}
