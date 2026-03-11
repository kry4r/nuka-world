import type { WorkflowSummary } from "@/lib/workflow";

type WorkflowCatalogProps = {
  workflows: WorkflowSummary[];
  selectedWorkflowId: string;
  onSelectWorkflow: (workflowId: string) => void;
};

export function WorkflowCatalog({
  workflows,
  selectedWorkflowId,
  onSelectWorkflow,
}: WorkflowCatalogProps) {
  return (
    <aside aria-label="Workflow catalog" className="workflow-catalog">
      <div className="workflow-catalog__header">
        <span className="workflow-catalog__eyebrow">Workflow</span>
        <h1>Workflows</h1>
      </div>

      <div className="workflow-catalog__list">
        {workflows.map((workflow) => (
          <button
            aria-pressed={workflow.id === selectedWorkflowId}
            className={`workflow-catalog__item ${workflow.id === selectedWorkflowId ? "is-active" : ""}`}
            key={workflow.id}
            onClick={() => onSelectWorkflow(workflow.id)}
            type="button"
          >
            <span className="workflow-catalog__item-title">{workflow.title}</span>
            <span className="workflow-catalog__item-summary">{workflow.summary}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
