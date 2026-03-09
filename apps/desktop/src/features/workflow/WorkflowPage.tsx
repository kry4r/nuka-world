import { useEffect, useState } from "react";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  WORKFLOW_DEFINITIONS,
  continueWorkflowSession,
  formatWorkflowSourceSession,
  seedWorkflowInputs,
  startWorkflowSession,
  type WorkflowEvent,
  type WorkflowLaunchIntent,
  type WorkflowSessionResponse,
} from "@/lib/workflow";
import { AgentColumn } from "./AgentColumn";
import { WorkflowLobby } from "./WorkflowLobby";
import { WorkflowRoom } from "./WorkflowRoom";

type WorkflowPageProps = {
  intent?: WorkflowLaunchIntent | null;
  onIntentHandled?: () => void;
};

export function WorkflowPage({ intent, onIntentHandled }: WorkflowPageProps = {}) {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(WORKFLOW_DEFINITIONS[0]?.id ?? "");
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [session, setSession] = useState<WorkflowSessionResponse | null>(null);
  const [roomPrompt, setRoomPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [sourceIntent, setSourceIntent] = useState<WorkflowLaunchIntent | null>(null);

  const selectedWorkflow =
    WORKFLOW_DEFINITIONS.find((workflow) => workflow.id === selectedWorkflowId) ??
    WORKFLOW_DEFINITIONS[0];
  const activeWorkflow = session
    ? WORKFLOW_DEFINITIONS.find((workflow) => workflow.id === session.workflowId)
    : selectedWorkflow;
  const transcriptEvents = session ? session.events.filter(isTranscriptEvent) : [];
  const timelineEvents = session ? session.events.filter((event) => event.kind === "node_event") : [];
  const sourceOrigin = session?.origin ?? sourceIntent?.origin ?? null;

  useEffect(() => {
    if (!intent) {
      return;
    }

    if (intent.kind === "open_workflow_lobby") {
      const defaultWorkflow = WORKFLOW_DEFINITIONS[0];
      const firstInputId = defaultWorkflow?.inputs[0]?.id ?? "goal";

      setSelectedWorkflowId(defaultWorkflow?.id ?? "");
      setInputValues(intent.prompt.trim() ? { [firstInputId]: intent.prompt.trim() } : {});
      setSession(null);
      setRoomPrompt("");
      setError(null);
      setSourceIntent(intent);
      onIntentHandled?.();
      return;
    }

    let cancelled = false;

    const openWorkflowRoom = async () => {
      setSelectedWorkflowId(intent.workflowId);
      setInputValues(seedWorkflowInputs(intent.workflowId, intent.prompt));
      setRoomPrompt("");
      setError(null);
      setIsStarting(true);
      setSourceIntent(intent);

      try {
        const nextSession = await startWorkflowSession(
          intent.workflowId,
          seedWorkflowInputs(intent.workflowId, intent.prompt),
          intent.origin,
        );

        if (!cancelled) {
          setSession(nextSession);
        }
      } catch (caughtError) {
        if (!cancelled) {
          const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsStarting(false);
          onIntentHandled?.();
        }
      }
    };

    void openWorkflowRoom();

    return () => {
      cancelled = true;
    };
  }, [intent, onIntentHandled]);

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
      const nextSession = await startWorkflowSession(
        selectedWorkflow.id,
        inputs,
        sourceIntent?.origin,
      );
      setSession(nextSession);
      setRoomPrompt("");
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
    } finally {
      setIsStarting(false);
    }
  };

  const handleContinue = async () => {
    if (!session || roomPrompt.trim().length === 0) {
      return;
    }

    setError(null);
    setIsContinuing(true);

    try {
      const nextSession = await continueWorkflowSession(session.sessionId, roomPrompt.trim());
      setSession(nextSession);
      setRoomPrompt("");
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
    } finally {
      setIsContinuing(false);
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
          {session ? (
            <WorkflowRoom
              isContinuing={isContinuing}
              onContinue={() => void handleContinue()}
              onPromptChange={setRoomPrompt}
              prompt={roomPrompt}
              session={session}
              workflowTitle={activeWorkflow?.title ?? session.workflowId}
            />
          ) : (
            <WorkflowLobby
              inputValues={inputValues}
              isStarting={isStarting}
              onInputChange={(inputId, value) =>
                setInputValues((current) => ({
                  ...current,
                  [inputId]: value,
                }))
              }
              onSelectWorkflow={(workflowId) => {
                setSelectedWorkflowId(workflowId);
                setSession(null);
                setError(null);
              }}
              onStart={() => void handleStart()}
              selectedWorkflow={selectedWorkflow}
              selectedWorkflowId={selectedWorkflowId}
              workflows={WORKFLOW_DEFINITIONS}
            />
          )}

          {error ? <Card description={error} title="Workflow Error" tone="soft" /> : null}
        </div>

        <Inspector
          description={
            session
              ? "Shows the active room, workflow lanes, event counts, and incoming chat context."
              : "Shows the selected workflow, required inputs, room readiness, and any incoming chat context."
          }
          title={session ? "Workflow Room Context" : "Workflow Context"}
        >
          <Card
            description={
              session
                ? activeWorkflow?.title ?? session.workflowId
                : activeWorkflow?.title ?? "No workflow selected"
            }
            title={session ? "Room Workflow" : "Selected Workflow"}
          />
          <Card
            description={
              session
                ? `${transcriptEvents.length} transcript events | ${timelineEvents.length} timeline events`
                : activeWorkflow?.inputs.map((input) => input.label).join(" | ") || "No inputs"
            }
            title={session ? "Room Activity" : "Required Inputs"}
          />
          <Card
            description={
              session
                ? `${Object.keys(session.inputs).length} captured inputs | ${session.status}`
                : "No session started yet"
            }
            title="Execution"
          />
          {sourceOrigin ? (
            <Card
              description={formatWorkflowSourceSession(sourceOrigin.sourceSessionId)}
              title="Source Session"
              tone="soft"
            />
          ) : null}
          {session ? (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <AgentColumn
                description="Maintains the session prompt, transcript, and routing context."
                detail={`Session ${session.sessionId.slice(0, 8)}...`}
                status="coordinating"
                title="Room Coordinator"
              />
              <AgentColumn
                description="Tracks workflow state transitions and timeline milestones."
                detail={`${timelineEvents.length} timeline events recorded`}
                status="tracking"
                title="Timeline Lane"
              />
              <AgentColumn
                description="Shapes the next assistant reply from the room conversation."
                detail={`${transcriptEvents.length} transcript events available`}
                status="drafting"
                title="Draft Lane"
              />
            </div>
          ) : null}
        </Inspector>
      </div>
    </div>
  );
}

function isTranscriptEvent(event: WorkflowEvent) {
  return event.kind === "user_message" || event.kind === "assistant_message";
}
