import { Card } from "@/components/ui/Card";
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
  return (
    <Card
      description="Persistent library selection with source and engine coverage."
      title="Library Explorer"
    >
      {loadError ? (
        <Card description={loadError} title="Knowledge Error" tone="soft" />
      ) : libraries.length === 0 ? (
        <p>Add a folder path in the workbench to initialize the first library connector.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {libraries.map((library) => {
            const isSelected = library.id === selectedLibraryId;

            return (
              <button
                aria-pressed={isSelected}
                key={library.id}
                onClick={() => onSelect(library.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  textAlign: "left",
                }}
                type="button"
              >
                <Card
                  description={`${library.connectors.length} source${library.connectors.length === 1 ? "" : "s"} | ${library.engine.label}`}
                  title={library.name}
                  tone={isSelected ? "accent" : "soft"}
                >
                  <p style={{ margin: "0.5rem 0 0", opacity: 0.8 }}>{library.description || "No summary yet."}</p>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
