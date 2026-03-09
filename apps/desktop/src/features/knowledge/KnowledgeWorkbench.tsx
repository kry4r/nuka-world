import { Card } from "@/components/ui/Card";
import type {
  KnowledgeIndexJobRecord,
  KnowledgeLibraryRecord,
  KnowledgeSearchResult,
} from "@/lib/knowledge";
import { KnowledgeEnginePanel } from "./KnowledgeEnginePanel";
import { KnowledgeJobsPanel } from "./KnowledgeJobsPanel";
import { KnowledgeSearchLab } from "./KnowledgeSearchLab";

export type KnowledgeWorkbenchMode = "search" | "sources" | "jobs" | "engine";

type KnowledgeWorkbenchProps = {
  activeMode: KnowledgeWorkbenchMode;
  folderPath: string;
  jobs: KnowledgeIndexJobRecord[];
  jobsError: string | null;
  libraries: KnowledgeLibraryRecord[];
  onAddFolder: () => void;
  onFolderPathChange: (value: string) => void;
  onModeChange: (mode: KnowledgeWorkbenchMode) => void;
  onRebuild: () => void;
  onSearch: () => void;
  onSearchQueryChange: (value: string) => void;
  results: KnowledgeSearchResult[];
  searchError: string | null;
  searchQuery: string;
  selectedLibrary: KnowledgeLibraryRecord | null;
};

const modeOptions: Array<{ id: KnowledgeWorkbenchMode; label: string }> = [
  { id: "search", label: "Search" },
  { id: "sources", label: "Sources" },
  { id: "jobs", label: "Jobs" },
  { id: "engine", label: "Engine" },
];

export function KnowledgeWorkbench({
  activeMode,
  folderPath,
  jobs,
  jobsError,
  libraries,
  onAddFolder,
  onFolderPathChange,
  onModeChange,
  onRebuild,
  onSearch,
  onSearchQueryChange,
  results,
  searchError,
  searchQuery,
  selectedLibrary,
}: KnowledgeWorkbenchProps) {
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <Card
        description={
          selectedLibrary
            ? `Operate on ${selectedLibrary.name}: add source connectors, rebuild jobs, and inspect engine contracts.`
            : "Search, add sources, trigger rebuilds, and inspect engine contracts without leaving the workbench."
        }
        title="Knowledge Workbench"
        tone="accent"
      >
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <div
            style={{
              display: "grid",
              gap: "0.75rem",
              gridTemplateColumns: "minmax(0, 1.2fr) minmax(14rem, 18rem) minmax(0, 1fr)",
            }}
          >
            <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "minmax(0, 1fr) auto" }}>
              <input
                aria-label="Search knowledge"
                className="field-input"
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="Search knowledge"
                value={searchQuery}
              />
              <button className="composer__send" onClick={onSearch} type="button">
                Search
              </button>
            </div>

            <div
              data-testid="knowledge-current-scope"
              style={{
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "0.9rem",
                padding: "0.85rem 1rem",
                display: "grid",
                gap: "0.3rem",
                alignContent: "start",
                background: "var(--color-surface-soft)",
              }}
            >
              <strong style={{ fontSize: "0.82rem", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Current Scope
              </strong>
              <span>{selectedLibrary?.name ?? "No library selected"}</span>
              <span style={{ fontSize: "0.9rem", opacity: 0.8 }}>
                Search spans all indexed libraries. Folder and rebuild actions use the selected library.
              </span>
            </div>

            <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "minmax(0, 1fr) auto auto" }}>
              <input
                aria-label="Folder path"
                className="field-input"
                onChange={(event) => onFolderPathChange(event.target.value)}
                placeholder="C:/docs/rust"
                value={folderPath}
              />
              <button className="composer__send" onClick={onAddFolder} type="button">
                Add Folder
              </button>
              <button
                className="settings-button settings-button--accent"
                disabled={!selectedLibrary}
                onClick={onRebuild}
                type="button"
              >
                Rebuild Index
              </button>
            </div>
          </div>
        </div>
      </Card>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        {modeOptions.map((mode) => {
          const isActive = mode.id === activeMode;

          return (
            <button
              aria-pressed={isActive}
              className={isActive ? "settings-button settings-button--accent" : "settings-button"}
              key={mode.id}
              onClick={() => onModeChange(mode.id)}
              type="button"
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      {activeMode === "search" ? (
        <KnowledgeSearchLab
          results={results}
          searchError={searchError}
          selectedLibrary={selectedLibrary}
        />
      ) : null}

      {activeMode === "sources" ? (
        <Card
          description={
            selectedLibrary
              ? `Connector identity and source metadata for ${selectedLibrary.name}.`
              : "Select or add a library to inspect source connectors."
          }
          title="Source Connectors"
        >
          {selectedLibrary ? (
            selectedLibrary.connectors.length > 0 ? (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {selectedLibrary.connectors.map((connector) => (
                  <Card
                    description={connector.path}
                    key={connector.id}
                    title={connector.label}
                    tone="soft"
                  >
                    <p style={{ margin: "0.5rem 0 0", opacity: 0.8 }}>
                      {connector.kind} | {connector.enabled ? "enabled" : "disabled"}
                    </p>
                  </Card>
                ))}
              </div>
            ) : (
              <p>Add a folder path above to attach the first source connector for {selectedLibrary.name}.</p>
            )
          ) : (
            <p>Select a library, then add a folder path above to attach the first source connector.</p>
          )}
        </Card>
      ) : null}

      {activeMode === "jobs" ? (
        <KnowledgeJobsPanel
          jobs={jobs}
          jobsError={jobsError}
          onRebuild={onRebuild}
          rebuildDisabled={!selectedLibrary}
          selectedLibrary={selectedLibrary}
        />
      ) : null}

      {activeMode === "engine" ? (
        <KnowledgeEnginePanel libraries={libraries} selectedLibrary={selectedLibrary} />
      ) : null}
    </div>
  );
}
