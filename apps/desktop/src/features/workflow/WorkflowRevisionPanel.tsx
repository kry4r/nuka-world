import { forwardRef } from "react";
import type { WorkflowExplanation, WorkflowRevisionPreview } from "@/lib/workflow";

type WorkflowRevisionPanelProps = {
  explanation: WorkflowExplanation | null;
  prompt: string;
  suggestions: string[];
  preview: WorkflowRevisionPreview | null;
  isGenerating: boolean;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
  onApply: () => void;
  onKeepEditing: () => void;
};

export const WorkflowRevisionPanel = forwardRef<HTMLDivElement, WorkflowRevisionPanelProps>(
  function WorkflowRevisionPanel(
    {
      explanation,
      isGenerating,
      onApply,
      onGenerate,
      onKeepEditing,
      onPromptChange,
      preview,
      prompt,
      suggestions,
    },
    ref,
  ) {
    return (
      <section className="workflow-section workflow-revision" ref={ref}>
        <div className="workflow-section__header">
          <h3>Improve workflow</h3>
          <span>{explanation?.title ?? "Workflow"}</span>
        </div>

        <div className="workflow-revision__body">
          <textarea
            className="workflow-revision__input"
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="Describe how to improve this workflow..."
            rows={4}
            value={prompt}
          />

          <div className="workflow-revision__suggestions">
            {suggestions.map((suggestion) => (
              <button
                className="workflow-suggestion"
                key={suggestion}
                onClick={() => onPromptChange(suggestion)}
                type="button"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="workflow-revision__actions">
            <button
              className="workflow-action workflow-action--primary"
              disabled={isGenerating || prompt.trim().length === 0}
              onClick={onGenerate}
              type="button"
            >
              {isGenerating ? "Generating…" : "Generate improved version"}
            </button>
          </div>
        </div>

        {preview ? (
          <div className="workflow-preview">
            <div className="workflow-section__header">
              <h3>Preview changes</h3>
            </div>

            <p>{preview.changeSummary}</p>

            <div className="workflow-preview__group">
              <span>Step changes</span>
              {preview.stepChanges.map((change) => (
                <strong key={change}>{change}</strong>
              ))}
            </div>

            <div className="workflow-preview__group">
              <span>Dependency changes</span>
              {preview.dependencyChanges.map((change) => (
                <strong key={change}>{change}</strong>
              ))}
            </div>

            <div className="workflow-preview__group">
              <span>Outcome changes</span>
              {preview.outcomeChanges.map((change) => (
                <strong key={change}>{change}</strong>
              ))}
            </div>

            <div className="workflow-revision__actions">
              <button className="workflow-action workflow-action--primary" onClick={onApply} type="button">
                Apply version
              </button>
              <button className="workflow-action" onClick={onKeepEditing} type="button">
                Keep editing
              </button>
            </div>
          </div>
        ) : null}
      </section>
    );
  },
);
