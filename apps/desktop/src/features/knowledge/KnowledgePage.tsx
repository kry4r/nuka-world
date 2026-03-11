import { useEffect, useMemo, useState } from "react";
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
import { KnowledgeWorkbench } from "./KnowledgeWorkbench";
import { LibraryExplorer } from "./LibraryExplorer";

export function KnowledgePage() {
  const [libraries, setLibraries] = useState<KnowledgeLibraryRecord[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [indexJobs, setIndexJobs] = useState<KnowledgeIndexJobRecord[]>([]);
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const knowledgeError = actionError ?? jobsError ?? null;

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
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setActionError(message);
    }
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
    <div className="page-layout knowledge-page">
      <div className="page-layout__body knowledge-page__body">
        <LibraryExplorer
          libraries={libraries}
          loadError={loadError}
          onSelect={setSelectedLibraryId}
          selectedLibraryId={selectedLibraryId}
        />

        <div className="knowledge-page__main">
          <KnowledgeWorkbench
            folderPath={folderPath}
            jobs={indexJobs}
            jobsError={jobsError}
            libraries={libraries}
            onAddFolder={() => void handleAddFolder()}
            onFolderPathChange={setFolderPath}
            onRebuild={() => void handleRebuild()}
            onSearch={() => void handleSearch()}
            onSearchQueryChange={setSearchQuery}
            results={results}
            searchError={searchError}
            searchQuery={searchQuery}
            selectedLibrary={selectedLibrary}
          />

          {knowledgeError ? <div className="knowledge-inline-error">{knowledgeError}</div> : null}
        </div>
      </div>
    </div>
  );
}
