import { useEffect, useMemo, useState } from "react";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
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
import { KnowledgeWorkbench, type KnowledgeWorkbenchMode } from "./KnowledgeWorkbench";
import { LibraryExplorer } from "./LibraryExplorer";

export function KnowledgePage() {
  const [libraries, setLibraries] = useState<KnowledgeLibraryRecord[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<KnowledgeWorkbenchMode>("search");
  const [folderPath, setFolderPath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [indexJobs, setIndexJobs] = useState<KnowledgeIndexJobRecord[]>([]);
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const knowledgeError = actionError ?? jobsError ?? loadError;

  useEffect(() => {
    let alive = true;

    void listKnowledgeLibraries()
      .then((items) => {
        if (!alive) {
          return;
        }

        setLibraries(items);
        setLoadError(null);
        setSelectedLibraryId((current) =>
          current && items.some((library) => library.id === current) ? current : items[0]?.id ?? null,
        );
      })
      .catch((caughtError) => {
        if (!alive) {
          return;
        }

        const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
        setLoadError(message);
        setLibraries([]);
        setSelectedLibraryId(null);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedLibraryId) {
      setIndexJobs([]);
      setJobsError(null);
      return;
    }

    let alive = true;
    void listIndexJobs(selectedLibraryId)
      .then((items) => {
        if (alive) {
          setIndexJobs(items);
          setJobsError(null);
        }
      })
      .catch((caughtError) => {
        if (!alive) {
          return;
        }

        const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
        setJobsError(message);
        setIndexJobs([]);
      });

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

    if (!selectedLibrary) {
      setActionError("Select a library before adding a connector.");
      return;
    }

    setActionError(null);

    try {
      const library = await addFolderConnector(selectedLibrary.id, nextPath);
      const nextLibraries = await listKnowledgeLibraries();
      setLibraries(nextLibraries);
      setLoadError(null);
      setSelectedLibraryId(library.id);
      setFolderPath("");
      setActiveMode("sources");
      const jobs = await listIndexJobs(library.id);
      setIndexJobs(jobs);
      setJobsError(null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setActionError(message);
    }
  };

  const handleRebuild = async () => {
    if (!selectedLibrary) {
      setActionError("Select a library before rebuilding the index.");
      return;
    }

    setActionError(null);

    try {
      await rebuildKnowledgeLibrary(selectedLibrary.id);
      const jobs = await listIndexJobs(selectedLibrary.id);
      setIndexJobs(jobs);
      setJobsError(null);
      setActiveMode("jobs");
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setActionError(message);
      setActiveMode("jobs");
    }
  };

  const handleSearch = async () => {
    setSearchError(null);

    try {
      const nextResults = await searchKnowledge(searchQuery);
      setResults(nextResults);
      setActiveMode("search");
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setSearchError(message);
      setResults([]);
      setActiveMode("search");
    }
  };

  return (
    <div className="page-layout">
      <SectionHeader
        meta="Explorer, search lab, jobs, and engine-aware retrieval contracts"
        status="Workbench"
        tag="Knowledge"
        title="Knowledge Libraries"
      />

      <div className="page-layout__body">
        <div
          className="page-layout__main"
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "minmax(240px, 320px) minmax(0, 1fr)",
          }}
        >
          <LibraryExplorer
            libraries={libraries}
            loadError={loadError}
            onSelect={setSelectedLibraryId}
            selectedLibraryId={selectedLibraryId}
          />

          <KnowledgeWorkbench
            activeMode={activeMode}
            folderPath={folderPath}
            jobs={indexJobs}
            jobsError={jobsError}
            libraries={libraries}
            onAddFolder={() => void handleAddFolder()}
            onFolderPathChange={setFolderPath}
            onModeChange={setActiveMode}
            onRebuild={() => void handleRebuild()}
            onSearch={() => void handleSearch()}
            onSearchQueryChange={setSearchQuery}
            results={results}
            searchError={searchError}
            searchQuery={searchQuery}
            selectedLibrary={selectedLibrary}
          />

          {knowledgeError ? (
            <Card description={knowledgeError} title="Knowledge Error" tone="soft" />
          ) : null}
        </div>

        <Inspector
          description="Library identity, source metadata, and engine metadata stay separate here so future adapters can expand without reworking the page."
          title="Knowledge Inspector"
        >
          {selectedLibrary ? (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <Card description={selectedLibrary.name} title="Selected Library" tone="accent" />
              <Card
                description={selectedLibrary.connectors.map((connector) => connector.label).join(", ")}
                title="Source Connectors"
                tone="soft"
              />
              <Card
                description={selectedLibrary.connectors.map((connector) => connector.path).join(" | ")}
                title="Source Paths"
                tone="soft"
              />
              <Card description={selectedLibrary.engine.label} title="Engine Summary" tone="soft" />
              <Card description={selectedLibrary.engine.health} title="Engine Health" tone="soft" />
              <Card
                description={selectedLibrary.engine.capabilities.join(", ")}
                title="Capabilities"
                tone="soft"
              />
            </div>
          ) : (
            <Card
              description="Select or add a library to inspect its source connectors and engine summary."
              title="Knowledge Inspector"
            />
          )}
        </Inspector>
      </div>
    </div>
  );
}
