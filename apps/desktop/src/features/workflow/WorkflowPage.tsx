import { useMemo, useState } from "react";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { startWorkflowSession, type WorkflowSessionResponse } from "@/lib/workflow";

type WorkflowDraft = {
  id: string;
  title: string;
  description: string;
  purpose: string;
  inputs: Array<{
    id: string;
    label: string;
    placeholder: string;
  }>;
};

const WORKFLOW_DRAFTS: WorkflowDraft[] = [
  {
    id: "workflow-research-brief",
    title: "Research Brief",
    description: "Agent + shared memory map",
    purpose: "Collect the goal, frame the research task, and begin a real workflow session.",
    inputs: [
      {
        id: "goal",
        label: "Goal",
        placeholder: "What should this workflow produce?",
      },
    ],
  },
  {
    id: "workflow-release-notes",
    title: "Release Notes",
    description: "3 agents ， review mode",
    purpose: "Capture the release objective and start a session with the supplied notes scope.",
    inputs: [
      {
        id: "releaseScope",
        label: "Release scope",
        placeholder: "Which changes belong in this release?",
      },
    ],
  },
  {
    id: "workflow-customer-triage",
    title: "Customer Triage",
    description: "5 agents ， tool-heavy",
    purpose: "Route incoming issues into a real workflow session with the selected triage goal.",
    inputs: [
      {
        id: "issueSummary",
        label: "Issue summary",
        placeholder: "What customer problem should the workflow analyze?",
      },
    ],
  },
];

export function WorkflowPage() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(WORKFLOW_DRAFTS[0]?.id ?? "");
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [session, setSession] = useState<WorkflowSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const selectedWorkflow = useMemo(
    () => WORKFLOW_DRAFTS.find((workflow) => workflow.id === selectedWorkflowId) ?? WORKFLOW_DRAFTS[0],
    [selectedWorkflowId],
  );

  const handleStart = async () => {
    if (!selectedWorkflow) {
      return;
    }

    setError(null);
    setIsStarting(true);

    try {
      const inputs = Object.fromEntries(
        selectedWorkflow.inputs
          .map((input) => [input.id, inputValues[input.id]?.trim() ?? ""])
          .filter(([, value]) => value.length > 0),
      );
      const nextSession = await startWorkflowSession(selectedWorkflow.id, inputs);
      setSession(nextSession);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
    } finally {
      setIsStarting(false);
    }
  };

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
            description="Select a workflow, review its purpose, fill the required inputs, and start a real session."
            title="Saved Workflows"
            tone="accent"
          />
          <div className="workflow-grid">
            {WORKFLOW_DRAFTS.map((workflow) => (
              <button
                className="settings-panel__trigger"
                key={workflow.id}
                onClick={() => {
                  setSelectedWorkflowId(workflow.id);
                  setSession(null);
                  setError(null);
                }}
                type="button"
              >
                <Card description={workflow.description} title={workflow.title} tone={workflow.id === selectedWorkflowId ? "accent" : "default"} />
              </button>
            ))}
          </div>

          {selectedWorkflow ? (
            <Card
              description={selectedWorkflow.purpose}
              title={`Run ${selectedWorkflow.title}`}
            >
              <div className="settings-form-grid">
                {selectedWorkflow.inputs.map((input) => (
                  <label className="settings-form-field settings-form-field--full" key={input.id}>
                    <div className="settings-form-field__copy">
                      <span className="settings-form-field__label">{input.label}</span>
                      <span className="settings-form-field__hint">Provide the input before starting the workflow session.</span>
                    </div>
                    <input
                      className="settings-input"
                      onChange={(event) =>
                        setInputValues((current) => ({
                          ...current,
                          [input.id]: event.target.value,
                        }))
                      }
                      placeholder={input.placeholder}
                      value={inputValues[input.id] ?? ""}
                    />
                  </label>
                ))}
              </div>
              <div className="settings-panel__footer">
                <button className="settings-button settings-button--accent" disabled={isStarting} onClick={() => void handleStart()} type="button">
                  {isStarting ? "Starting..." : "Start Workflow"}
                </button>
              </div>
            </Card>
          ) : null}

          {error ? <Card description={error} title="Workflow Error" tone="soft" /> : null}
          {session ? (
            <Card
              description={`Session ${session.sessionId.slice(0, 8)}´ ， ${session.status}`}
              title="Execution State"
              tone="soft"
            />
          ) : null}
        </div>

        <Inspector description="Shows the selected workflow, required inputs, and the latest execution state." title="Workflow Context">
          <Card description={selectedWorkflow?.title ?? "No workflow selected"} title="Selected Workflow" />
          <Card description={selectedWorkflow?.inputs.map((input) => input.label).join(" ， ") || "No inputs"} title="Required Inputs" />
          <Card description={session ? `${Object.keys(session.inputs).length} input values captured` : "No session started yet"} title="Execution" />
        </Inspector>
      </div>
    </div>
  );
}
