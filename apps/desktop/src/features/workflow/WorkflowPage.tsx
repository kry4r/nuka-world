import { AgentColumn } from "./AgentColumn";

export function WorkflowPage() {
  return (
    <section>
      <h2>Workflow Sessions</h2>
      <p>Saved workflows start fresh runtime sessions.</p>
      <div>
        <AgentColumn title="Lead Agent" />
        <AgentColumn title="Support Agent" />
      </div>
    </section>
  );
}
