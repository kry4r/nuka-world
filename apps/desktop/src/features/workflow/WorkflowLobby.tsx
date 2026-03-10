import { Card } from "@/components/ui/Card";

export type WorkflowDraft = {
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

type WorkflowLobbyProps = {
  workflows: WorkflowDraft[];
  selectedWorkflow: WorkflowDraft | undefined;
  selectedWorkflowId: string;
  inputValues: Record<string, string>;
  isStarting: boolean;
  startDisabled: boolean;
  onInputChange: (inputId: string, value: string) => void;
  onSelectWorkflow: (workflowId: string) => void;
  onStart: () => void;
};

export function WorkflowLobby({
  inputValues,
  isStarting,
  onInputChange,
  onSelectWorkflow,
  onStart,
  selectedWorkflow,
  selectedWorkflowId,
  startDisabled,
  workflows,
}: WorkflowLobbyProps) {
  return (
    <>
      <Card
        description="Choose a saved workflow and open a dedicated room for the session."
        title="Workflow Lobby"
        tone="accent"
      />

      <div className="workflow-grid">
        {workflows.map((workflow) => (
          <button
            className="settings-panel__trigger"
            key={workflow.id}
            onClick={() => onSelectWorkflow(workflow.id)}
            type="button"
          >
            <Card
              description={workflow.description}
              title={workflow.title}
              tone={workflow.id === selectedWorkflowId ? "accent" : "default"}
            />
          </button>
        ))}
      </div>

      {selectedWorkflow ? (
        <Card description={selectedWorkflow.purpose} title={`Run ${selectedWorkflow.title}`}>
          <div className="settings-form-grid">
            {selectedWorkflow.inputs.map((input) => (
              <label className="settings-form-field settings-form-field--full" key={input.id}>
                <div className="settings-form-field__copy">
                  <span className="settings-form-field__label">{input.label}</span>
                  <span className="settings-form-field__hint">Provide the input before starting the workflow session.</span>
                </div>
                <input
                  className="settings-input"
                  onChange={(event) => onInputChange(input.id, event.target.value)}
                  placeholder={input.placeholder}
                  value={inputValues[input.id] ?? ""}
                />
              </label>
            ))}
          </div>
          <div className="settings-panel__footer">
            <button
              className="settings-button settings-button--accent"
              disabled={startDisabled}
              onClick={onStart}
              type="button"
            >
              {isStarting ? "Starting..." : "Start Workflow"}
            </button>
          </div>
        </Card>
      ) : null}
    </>
  );
}
