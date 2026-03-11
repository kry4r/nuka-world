import type { KnowledgeLibraryRecord } from "@/lib/knowledge";

type KnowledgeEnginePanelProps = {
  libraries: KnowledgeLibraryRecord[];
  selectedLibrary: KnowledgeLibraryRecord | null;
};

export function KnowledgeEnginePanel({
  libraries,
  selectedLibrary,
}: KnowledgeEnginePanelProps) {
  if (!selectedLibrary) {
    return <p className="knowledge-panel__empty">Select a source to inspect its runtime profile.</p>;
  }

  const sharedLibraries = libraries
    .filter((library) => library.engine.id === selectedLibrary.engine.id)
    .map((library) => library.name);

  return (
    <div className="knowledge-secondary-list">
      <div className="knowledge-secondary-row">
        <strong>{selectedLibrary.engine.label}</strong>
        <span>{selectedLibrary.engine.health}</span>
      </div>

      <div className="knowledge-secondary-row">
        <strong>Capabilities</strong>
        <span>{selectedLibrary.engine.capabilities.join(", ")}</span>
      </div>

      <div className="knowledge-secondary-row">
        <strong>Bound libraries</strong>
        <span>{sharedLibraries.join(", ")}</span>
      </div>
    </div>
  );
}
