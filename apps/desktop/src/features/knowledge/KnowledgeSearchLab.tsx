import { Card } from "@/components/ui/Card";
import type { KnowledgeLibraryRecord, KnowledgeSearchResult } from "@/lib/knowledge";

type KnowledgeSearchLabProps = {
  results: KnowledgeSearchResult[];
  searchError: string | null;
  selectedLibrary: KnowledgeLibraryRecord | null;
};

export function KnowledgeSearchLab({
  results,
  searchError,
  selectedLibrary,
}: KnowledgeSearchLabProps) {
  return (
    <Card title="Search Lab">
      <p data-testid="knowledge-search-lab-description" style={{ margin: "0 0 0.75rem" }}>
        {selectedLibrary
          ? `${selectedLibrary.name} is the current action scope. Search still spans all indexed libraries, and every hit is labeled with its source library.`
          : "Search spans all indexed libraries once you run a query from the workbench above."}
      </p>
      {searchError ? <Card description={searchError} title="Search Error" tone="soft" /> : null}
      {results.length === 0 ? (
        <p>Run a search above to compare what each indexed library can answer.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {results.map((result) => (
            <Card
              description={result.path}
              key={`${result.collectionId}-${result.path}`}
              title={result.collectionName}
              tone="soft"
            >
              <p style={{ margin: "0.5rem 0 0", opacity: 0.8 }}>{result.snippet}</p>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}
