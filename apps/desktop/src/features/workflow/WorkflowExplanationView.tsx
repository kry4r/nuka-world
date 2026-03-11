import type { WorkflowExplanation } from "@/lib/workflow";

type WorkflowExplanationViewProps = {
  explanation: WorkflowExplanation | null;
  isLoading: boolean;
  sourceLabel: string | null;
  sourcePrompt: string | null;
  revisionNotice: string | null;
  onEnterChat: () => void;
  onImprove: () => void;
};

export function WorkflowExplanationView({
  explanation,
  isLoading,
  onEnterChat,
  onImprove,
  revisionNotice,
  sourceLabel,
  sourcePrompt,
}: WorkflowExplanationViewProps) {
  if (isLoading) {
    return <div className="workflow-loading-state">Loading workflow explanation…</div>;
  }

  if (!explanation) {
    return <div className="workflow-loading-state">Choose a workflow to inspect it.</div>;
  }

  return (
    <div className="workflow-explanation">
      <section className="workflow-section workflow-overview">
        <div className="workflow-overview__header">
          <div className="workflow-overview__copy">
            <span className="workflow-overview__eyebrow">Overview</span>
            <h2>{explanation.title}</h2>
            <p>{explanation.summary}</p>
          </div>

          <div className="workflow-overview__actions">
            <button className="workflow-action workflow-action--primary" onClick={onEnterChat} type="button">
              Enter chat
            </button>
            <button className="workflow-action" onClick={onImprove} type="button">
              Improve
            </button>
          </div>
        </div>

        <div className="workflow-overview__meta">
          {sourceLabel ? <span className="workflow-pill">{sourceLabel}</span> : null}
          {sourcePrompt ? <span className="workflow-pill workflow-pill--soft">{sourcePrompt}</span> : null}
          {revisionNotice ? (
            <span className="workflow-pill workflow-pill--accent">{revisionNotice}</span>
          ) : null}
        </div>
      </section>

      <section className="workflow-section">
        <div className="workflow-section__header">
          <h3>Step flow</h3>
          <span>{explanation.steps.length} steps</span>
        </div>

        <div className="workflow-step-list">
          {explanation.steps.map((step, index) => (
            <article className="workflow-step-card" key={step.id}>
              <div className="workflow-step-card__index">{index + 1}</div>
              <div className="workflow-step-card__body">
                <h4>{step.title}</h4>
                <p>{step.purpose}</p>
                <dl className="workflow-step-card__meta">
                  <div>
                    <dt>Executor</dt>
                    <dd>{step.executor}</dd>
                  </div>
                  <div>
                    <dt>Input source</dt>
                    <dd>{step.inputSource}</dd>
                  </div>
                  <div>
                    <dt>Output</dt>
                    <dd>{step.output}</dd>
                  </div>
                  <div>
                    <dt>Completion</dt>
                    <dd>{step.completion}</dd>
                  </div>
                </dl>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="workflow-section">
        <div className="workflow-section__header">
          <h3>Dependencies</h3>
        </div>

        <div className="workflow-dependency-grid">
          <div className="workflow-dependency-card">
            <span>Agents</span>
            {explanation.dependencies.agents.map((agent) => (
              <strong key={agent}>{agent}</strong>
            ))}
          </div>
          <div className="workflow-dependency-card">
            <span>Tools and knowledge</span>
            {explanation.dependencies.toolsAndKnowledge.map((dependency) => (
              <strong key={dependency}>{dependency}</strong>
            ))}
          </div>
          <div className="workflow-dependency-card">
            <span>Required inputs</span>
            {explanation.dependencies.requiredInputs.map((input) => (
              <strong key={input}>{input}</strong>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
