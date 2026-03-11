import type { KnowledgeLibraryRecord } from "@/lib/knowledge";

type LibraryExplorerProps = {
  libraries: KnowledgeLibraryRecord[];
  loadError: string | null;
  selectedLibraryId: string | null;
  onSelect: (libraryId: string) => void;
};

export function LibraryExplorer({
  libraries,
  loadError,
  onSelect,
  selectedLibraryId,
}: LibraryExplorerProps) {
  const selectedLibrary =
    libraries.find((library) => library.id === selectedLibraryId) ?? null;

  return (
    <aside aria-label="Knowledge sources" className="knowledge-sidebar">
      <div className="knowledge-sidebar__header">
        <span className="knowledge-sidebar__eyebrow">Knowledge</span>
        <h2>Sources</h2>
      </div>

      {loadError ? (
        <div className="knowledge-inline-error">{loadError}</div>
      ) : null}

      {libraries.length > 1 ? (
        <div className="knowledge-library-list">
          {libraries.map((library) => {
            const isSelected = library.id === selectedLibraryId;

            return (
              <button
                aria-pressed={isSelected}
                className={`knowledge-library-list__item${isSelected ? " is-active" : ""}`}
                key={library.id}
                onClick={() => onSelect(library.id)}
                type="button"
              >
                <span className="knowledge-library-list__title">{library.name}</span>
                <span className="knowledge-library-list__meta">
                  {library.connectors.length} source{library.connectors.length === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {selectedLibrary?.connectors.length ? (
        <div className="knowledge-source-list">
          {selectedLibrary.connectors.map((connector) => (
            <div className="knowledge-source-row" key={connector.id}>
              <strong>{connector.label}</strong>
              <span>{connector.path}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="knowledge-source-empty">
          Add a local folder to start indexing snippets from your project files.
        </div>
      )}
    </aside>
  );
}
