import { Card } from "@/components/ui/Card";
import type { KnowledgeLibraryRecord } from "@/lib/knowledge";

type KnowledgeEnginePanelProps = {
  libraries: KnowledgeLibraryRecord[];
  selectedLibrary: KnowledgeLibraryRecord | null;
};

export function KnowledgeEnginePanel({
  libraries,
  selectedLibrary,
}: KnowledgeEnginePanelProps) {
  const bindingsByEngine = libraries.reduce<
    Record<string, { engine: KnowledgeLibraryRecord["engine"]; libraryNames: string[] }>
  >((groups, library) => {
    const existing = groups[library.engine.id];

    if (existing) {
      existing.libraryNames.push(library.name);
      return groups;
    }

    groups[library.engine.id] = {
      engine: library.engine,
      libraryNames: [library.name],
    };

    return groups;
  }, {});

  return (
    <Card title="Engine Summary">
      <p style={{ margin: "0 0 0.75rem" }}>
        {selectedLibrary
          ? `${selectedLibrary.name} is currently selected. Compare engine bindings below to see which libraries share a runtime contract.`
          : "Engine bindings appear here once libraries are available."}
      </p>
      {libraries.length > 0 ? (
        <div data-testid="knowledge-engine-bindings" style={{ display: "grid", gap: "0.75rem" }}>
          {Object.values(bindingsByEngine).map((binding) => {
            const isSelectedEngine = binding.engine.id === selectedLibrary?.engine.id;

            return (
              <Card
                description={`${binding.engine.health} | ${binding.engine.id}`}
                key={binding.engine.id}
                title={binding.engine.label}
                tone={isSelectedEngine ? "accent" : "soft"}
              >
                <p style={{ margin: "0.5rem 0 0.35rem" }}>
                  <strong>Bound Libraries</strong>
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {binding.libraryNames.map((libraryName) => (
                    <span key={libraryName}>{libraryName}</span>
                  ))}
                </div>
                <p style={{ margin: "0.75rem 0 0.35rem" }}>
                  <strong>Capabilities</strong>
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {binding.engine.capabilities.map((capability) => (
                    <span key={capability}>{capability}</span>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <p>Add a library connector to inspect engine bindings and capabilities.</p>
      )}
    </Card>
  );
}
