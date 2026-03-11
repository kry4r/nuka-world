import { useEffect, useMemo, useRef, useState } from "react";
import {
  WORKFLOW_DEFINITIONS,
  explainWorkflow,
  reviseWorkflow,
  type WorkflowExplanation,
  type WorkflowLaunchIntent,
  type WorkflowRevisionPreview,
  type WorkflowSummary,
} from "@/lib/workflow";
import { WorkflowCatalog } from "./WorkflowCatalog";
import { WorkflowExplanationView } from "./WorkflowExplanationView";
import { WorkflowRevisionPanel } from "./WorkflowRevisionPanel";

const REVISION_SUGGESTIONS = [
  "Search the knowledge base before drafting",
  "Split the summary into review and publish stages",
  "Reduce manual confirmations",
  "Make the output more suitable for a product brief",
];

type WorkflowPageProps = {
  intent?: WorkflowLaunchIntent | null;
  onIntentHandled?: () => void;
};

function workflowSummaries(): WorkflowSummary[] {
  return WORKFLOW_DEFINITIONS.map((workflow) => ({
    id: workflow.id,
    title: workflow.title,
    summary: workflow.purpose,
  }));
}

export function WorkflowPage({ intent, onIntentHandled }: WorkflowPageProps = {}) {
  const catalog = useMemo(() => workflowSummaries(), []);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(catalog[0]?.id ?? "");
  const [explanation, setExplanation] = useState<WorkflowExplanation | null>(null);
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [revisionPreview, setRevisionPreview] = useState<WorkflowRevisionPreview | null>(null);
  const [isGeneratingRevision, setIsGeneratingRevision] = useState(false);
  const [revisionNotice, setRevisionNotice] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [sourcePrompt, setSourcePrompt] = useState<string | null>(null);
  const revisionPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!intent) {
      return;
    }

    if (intent.kind === "open_workflow_room") {
      setSelectedWorkflowId(intent.workflowId);
      setSourceLabel("Generated from chat");
      setSourcePrompt(intent.prompt);
    } else {
      setSelectedWorkflowId(catalog[0]?.id ?? "");
      setSourceLabel("Drafted from chat");
      setSourcePrompt(intent.prompt);
      setRevisionPrompt(intent.prompt);
    }

    setRevisionPreview(null);
    setRevisionNotice(null);
    onIntentHandled?.();
  }, [catalog, intent, onIntentHandled]);

  useEffect(() => {
    if (!selectedWorkflowId) {
      setExplanation(null);
      return;
    }

    let cancelled = false;

    setIsLoadingExplanation(true);
    setExplanationError(null);
    setRevisionPreview(null);
    setRevisionNotice(null);

    void explainWorkflow(selectedWorkflowId)
      .then((nextExplanation) => {
        if (!cancelled) {
          setExplanation(nextExplanation);
        }
      })
      .catch((caughtError) => {
        if (!cancelled) {
          const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
          setExplanationError(message);
          setExplanation(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingExplanation(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedWorkflowId]);

  const handleGenerateRevision = async () => {
    if (!selectedWorkflowId || revisionPrompt.trim().length === 0) {
      return;
    }

    setIsGeneratingRevision(true);
    setExplanationError(null);
    setRevisionNotice(null);

    try {
      const preview = await reviseWorkflow(selectedWorkflowId, revisionPrompt.trim());
      setRevisionPreview(preview);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setExplanationError(message);
    } finally {
      setIsGeneratingRevision(false);
    }
  };

  const handleEnterChat = () => {
    window.dispatchEvent(
      new CustomEvent("nuka:navigate", {
        detail: { page: "chat" },
      }),
    );
  };

  const handleImprove = () => {
    revisionPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const handleApplyRevision = () => {
    if (!revisionPreview) {
      return;
    }

    setRevisionNotice(revisionPreview.changeSummary);
    setRevisionPreview(null);
  };

  return (
    <div className="page-layout workflow-page">
      <div className="page-layout__body workflow-page__body">
        <WorkflowCatalog
          selectedWorkflowId={selectedWorkflowId}
          workflows={catalog}
          onSelectWorkflow={(workflowId) => {
            setSelectedWorkflowId(workflowId);
            setSourceLabel(null);
            setSourcePrompt(null);
          }}
        />

        <div className="page-layout__main workflow-page__detail">
          <WorkflowExplanationView
            explanation={explanation}
            isLoading={isLoadingExplanation}
            onEnterChat={handleEnterChat}
            onImprove={handleImprove}
            revisionNotice={revisionNotice}
            sourceLabel={sourceLabel}
            sourcePrompt={sourcePrompt}
          />

          <WorkflowRevisionPanel
            explanation={explanation}
            isGenerating={isGeneratingRevision}
            preview={revisionPreview}
            prompt={revisionPrompt}
            ref={revisionPanelRef}
            suggestions={REVISION_SUGGESTIONS}
            onApply={handleApplyRevision}
            onGenerate={() => {
              void handleGenerateRevision();
            }}
            onKeepEditing={() => setRevisionPreview(null)}
            onPromptChange={setRevisionPrompt}
          />

          {explanationError ? (
            <div className="workflow-inline-error">{explanationError}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
