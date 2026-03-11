import type { KnowledgeSearchResult } from "@/lib/knowledge";

type KnowledgeSearchLabProps = {
  results: KnowledgeSearchResult[];
  searchError: string | null;
};

export function KnowledgeSearchLab({
  results,
  searchError,
}: KnowledgeSearchLabProps) {
  return (
    <section className="knowledge-panel">
      <div className="knowledge-panel__header">
        <h3>Search results</h3>
        <span>Snippet retrieval</span>
      </div>

      {searchError ? <div className="knowledge-inline-error">{searchError}</div> : null}

      {results.length === 0 ? (
        <p className="knowledge-panel__empty">
          Search the indexed snippets once at least one local folder is connected.
        </p>
      ) : (
        <div className="knowledge-result-list">
          {results.map((result) => (
            <article
              className="knowledge-result-card"
              key={`${result.collectionId}-${result.path}`}
            >
              <strong>{result.collectionName}</strong>
              <span>{result.path}</span>
              <p>{result.snippet}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
