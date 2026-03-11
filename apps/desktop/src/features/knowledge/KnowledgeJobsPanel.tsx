import type { KnowledgeIndexJobRecord } from "@/lib/knowledge";

type KnowledgeJobsPanelProps = {
  jobs: KnowledgeIndexJobRecord[];
  jobsError: string | null;
};

export function KnowledgeJobsPanel({
  jobs,
  jobsError,
}: KnowledgeJobsPanelProps) {
  if (jobsError) {
    return <div className="knowledge-inline-error">{jobsError}</div>;
  }

  if (jobs.length === 0) {
    return <p className="knowledge-panel__empty">No index activity yet.</p>;
  }

  return (
    <div className="knowledge-secondary-list">
      {jobs.map((job) => (
        <div className="knowledge-secondary-row" key={job.id}>
          <strong>{job.status}</strong>
          <span>{job.detail ?? "No detail"}</span>
        </div>
      ))}
    </div>
  );
}
