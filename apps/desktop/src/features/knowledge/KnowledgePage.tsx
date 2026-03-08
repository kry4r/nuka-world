import { useEffect, useMemo, useState } from "react";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import {
  addFolderConnector,
  listIndexJobs,
  listKnowledgeLibraries,
  rebuildKnowledgeLibrary,
  searchKnowledge,
  type KnowledgeIndexJobRecord,
  type KnowledgeLibraryRecord,
  type KnowledgeSearchResult,
} from "@/lib/knowledge";

export function KnowledgePage() {
  const [libraries, setLibraries] = useState<KnowledgeLibraryRecord[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [indexJobs, setIndexJobs] = useState<KnowledgeIndexJobRecord[]>([]);
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void listKnowledgeLibraries()
      .then((items) => {
        if (!alive) {
          return;
        }

        setLibraries(items);
        setSelectedLibraryId(items[0]?.id ?? null);
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedLibraryId) {
      setIndexJobs([]);
      return;
    }

    let alive = true;
    void listIndexJobs(selectedLibraryId)
      .then((items) => {
        if (alive) {
          setIndexJobs(items);
        }
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, [selectedLibraryId]);

  const selectedLibrary = useMemo(
    () => libraries.find((library) => library.id === selectedLibraryId) ?? null,
    [libraries, selectedLibraryId],
  );

  const handleAddFolder = async () => {
    const nextPath = folderPath.trim();
    if (!nextPath) {
      return;
    }

    const library = await addFolderConnector(nextPath);
    const nextLibraries = await listKnowledgeLibraries();
    setLibraries(nextLibraries);
    setSelectedLibraryId(library.id);
    setFolderPath("");
    const jobs = await listIndexJobs(library.id);
    setIndexJobs(jobs);
  };

  const handleRebuild = async () => {
    if (!selectedLibrary) {
      return;
    }

    await rebuildKnowledgeLibrary(selectedLibrary.id);
    const jobs = await listIndexJobs(selectedLibrary.id);
    setIndexJobs(jobs);
  };

  const handleSearch = async () => {
    setSearchError(null);

    try {
      const nextResults = await searchKnowledge(searchQuery);
      setResults(nextResults);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setSearchError(message);
      setResults([]);
    }
  };

  return (
    <div className="page-layout">
      <div className="page-layout__body">
        <div className="page-layout__main">
          <Card
            description="Connect a local folder, inspect index jobs, and search the saved library state."
            title="Local Folder Connectors"
            tone="accent"
          />

          <div className="split-row">
            <input
              aria-label="Folder path"
              className="field-input"
              onChange={(event) => setFolderPath(event.target.value)}
              placeholder="C:/docs/rust"
              value={folderPath}
            />
            <button className="composer__send" onClick={() => void handleAddFolder()} type="button">
              Add Folder
            </button>
          </div>

          {libraries.length === 0 ? (
            <Card description="Add a local folder connector to create the first knowledge library." title="No folder connectors yet." tone="soft" />
          ) : (
            <Card title="Libraries">
              <div className="workflow-grid">
                {libraries.map((library) => (
                  <button
                    className="settings-panel__trigger"
                    key={library.id}
                    onClick={() => setSelectedLibraryId(library.id)}
                    type="button"
                  >
                    <Card description={library.connectors.map((connector) => connector.path).join(" �� ")} title={library.name} tone={library.id === selectedLibraryId ? "accent" : "soft"} />
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card title="Index Jobs">
            {indexJobs.length === 0 ? (
              <p>No index jobs recorded yet.</p>
            ) : (
              <div className="knowledge-row">
                {indexJobs.map((job) => (
                  <Card description={job.detail ?? "No detail"} key={job.id} title={job.status} tone="soft" />
                ))}
              </div>
            )}
            <div className="settings-panel__footer">
              <button className="settings-button settings-button--accent" disabled={!selectedLibrary} onClick={() => void handleRebuild()} type="button">
                Rebuild Index
              </button>
            </div>
          </Card>

          <Card title="Search">
            <div className="split-row">
              <input
                aria-label="Search knowledge"
                className="field-input"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search knowledge"
                value={searchQuery}
              />
              <button className="composer__send" onClick={() => void handleSearch()} type="button">
                Search
              </button>
            </div>
            {searchError ? <Card description={searchError} title="Search Error" tone="soft" /> : null}
            {results.length > 0 ? (
              <div className="knowledge-row">
                {results.map((result) => (
                  <Card description={result.path} key={`${result.collectionId}-${result.path}`} title={result.snippet} tone="soft" />
                ))}
              </div>
            ) : null}
          </Card>
        </div>

        <Inspector description="Shows the selected library, connector scope, and supported extensions from real backend state." title="Library State">
          {selectedLibrary ? (
            <>
              <Card description={selectedLibrary.name} title="Selected Library" tone="accent" />
              <Card description={selectedLibrary.connectors.map((connector) => connector.path).join(" �� ")} title="Connector Paths" tone="soft" />
              <Card description={selectedLibrary.supportedExtensions.join(", ")} title="Supported Extensions" tone="soft" />
              <Card description={selectedLibrary.engine} title="Engine" tone="soft" />
            </>
          ) : (
            <Card description="Select or add a library to inspect its real connector state." title="Library State" />
          )}
        </Inspector>
      </div>
    </div>
  );
}

