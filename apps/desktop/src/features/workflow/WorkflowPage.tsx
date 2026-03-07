import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";

export function WorkflowPage() {
  return (
    <div className="page-layout">
      <SectionHeader
        meta="Saved types, sessions, and shared memory"
        status="Shared Memory"
        tag="Workflow"
        title="Saved Workflows"
      />

      <div className="page-layout__body">
        <div className="page-layout__main">
          <Card
            description="Reusable collaboration templates that fresh sessions can replay safely."
            title="Saved Workflows"
            tone="accent"
          />
          <div className="workflow-grid">
            <Card description="Agent + shared memory map" title="Research Brief" />
            <Card description="3 agents · review mode" title="Release Notes" />
            <Card description="5 agents · tool-heavy" title="Customer Triage" />
          </div>
          <Card description="Release Brief · Bug triage · Candidate blog yesterday" title="Recent Sessions" />
        </div>

        <Inspector description="Shared memory, tool strategy, and left-nav context." title="Workflow Context">
          <Card description="Shared memory enabled for 2 workflows" title="Memory" />
          <Card description="Git, browser, and integrated codex" title="Tools" />
          <Card description="Researcher, review, and planning roles available" title="Live Mix" />
        </Inspector>
      </div>
    </div>
  );
}
