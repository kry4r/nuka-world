import { Card } from "@/components/ui/Card";
import type { KnowledgeIndexJobRecord, KnowledgeLibraryRecord } from "@/lib/knowledge";

type KnowledgeJobsPanelProps = {
  jobs: KnowledgeIndexJobRecord[];
  jobsError: string | null;
  onRebuild: () => void;
  rebuildDisabled: boolean;
  selectedLibrary: KnowledgeLibraryRecord | null;
};

export function KnowledgeJobsPanel({
  jobs,
  jobsError,
  onRebuild,
  rebuildDisabled,
  selectedLibrary,
}: KnowledgeJobsPanelProps) {
  return (
    <Card
      description={
        selectedLibrary
          ? `Index rebuild state and job history for ${selectedLibrary.name}.`
          : "Select a library to inspect its index jobs."
      }
      title="Index Jobs"
    >
      {jobsError ? (
        <Card description={jobsError} title="Knowledge Error" tone="soft" />
      ) : jobs.length === 0 ? (
        <p>
          {selectedLibrary
            ? `Rebuild the index after adding a folder connector to record the first job for ${selectedLibrary.name}.`
            : "Select a library, then rebuild its index to record the first job."}
        </p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {jobs.map((job) => (
            <Card
              description={job.detail ?? "No detail"}
              key={job.id}
              title={job.status}
              tone="soft"
            />
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
        <button
          className="settings-button settings-button--accent"
          disabled={rebuildDisabled}
          onClick={onRebuild}
          type="button"
        >
          Rebuild Index
        </button>
      </div>
    </Card>
  );
}
