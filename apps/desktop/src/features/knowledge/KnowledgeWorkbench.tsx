import type {
  KnowledgeIndexJobRecord,
  KnowledgeLibraryRecord,
  KnowledgeSearchResult,
} from "@/lib/knowledge";
import { KnowledgeEnginePanel } from "./KnowledgeEnginePanel";
import { KnowledgeJobsPanel } from "./KnowledgeJobsPanel";
import { KnowledgeSearchLab } from "./KnowledgeSearchLab";

type KnowledgeWorkbenchProps = {
  folderPath: string;
  jobs: KnowledgeIndexJobRecord[];
  jobsError: string | null;
  libraries: KnowledgeLibraryRecord[];
  onAddFolder: () => void;
  onFolderPathChange: (value: string) => void;
  onRebuild: () => void;
  onSearch: () => void;
  onSearchQueryChange: (value: string) => void;
  results: KnowledgeSearchResult[];
  searchError: string | null;
  searchQuery: string;
  selectedLibrary: KnowledgeLibraryRecord | null;
};

export function KnowledgeWorkbench({
  folderPath,
  jobs,
  jobsError,
  libraries,
  onAddFolder,
  onFolderPathChange,
  onRebuild,
  onSearch,
  onSearchQueryChange,
  results,
  searchError,
  searchQuery,
  selectedLibrary,
}: KnowledgeWorkbenchProps) {
  const hasSources = (selectedLibrary?.connectors.length ?? 0) > 0;
  const latestJobDetail = jobs.length > 0 ? jobs[jobs.length - 1]?.detail : undefined;

  return (
    <section className="knowledge-main">
      <header className="knowledge-main__header">
        <div className="knowledge-main__copy">
          <span className="knowledge-main__eyebrow">PageIndex</span>
          <h1>{selectedLibrary?.name ?? "Knowledge base"}</h1>
          <p>
            Connect a local folder, rebuild the index, then search snippets from the saved
            sources.
          </p>
        </div>
      </header>

      <div className="knowledge-action-bar">
        <input
          aria-label="Folder path"
          className="field-input knowledge-action-bar__input"
          onChange={(event) => onFolderPathChange(event.target.value)}
          placeholder="C:/docs/rust"
          value={folderPath}
        />
        <button className="composer__send" onClick={onAddFolder} type="button">
          Add Folder
        </button>
        {hasSources ? (
          <button
            className="settings-button settings-button--accent"
            disabled={!selectedLibrary}
            onClick={onRebuild}
            type="button"
          >
            Rebuild Index
          </button>
        ) : null}
      </div>

      {latestJobDetail ? <div className="knowledge-inline-note">{latestJobDetail}</div> : null}

      {hasSources ? (
        <>
          <div className="knowledge-search-bar">
            <input
              aria-label="Search knowledge"
              className="field-input knowledge-search-bar__input"
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search indexed snippets"
              value={searchQuery}
            />
            <button className="composer__send" onClick={onSearch} type="button">
              Search
            </button>
          </div>

          <KnowledgeSearchLab results={results} searchError={searchError} />

          <details className="knowledge-secondary">
            <summary>Index activity</summary>
            <KnowledgeJobsPanel jobs={jobs} jobsError={jobsError} />
          </details>

          <details className="knowledge-secondary">
            <summary>Engine details</summary>
            <KnowledgeEnginePanel libraries={libraries} selectedLibrary={selectedLibrary} />
          </details>
        </>
      ) : null}
    </section>
  );
}
