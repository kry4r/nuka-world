import { FlatSelect } from "@/components/ui/FlatSelect";

type MemoryGraphControlsProps = {
  filterKind: string;
  kindOptions: Array<{
    label: string;
    value: string;
  }>;
  searchQuery: string;
  onFilterKindChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
};

export function MemoryGraphControls({
  filterKind,
  kindOptions,
  searchQuery,
  onFilterKindChange,
  onSearchQueryChange,
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
          <FlatSelect
            aria-label="Filter kind"
            className="memory-controls__select"
            onChange={(event) => onFilterKindChange(event.target.value)}
            shellClassName="memory-controls__select-shell"
            value={filterKind}
          >
            {kindOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FlatSelect>
        </label>
      </div>
    </div>
  );
}
