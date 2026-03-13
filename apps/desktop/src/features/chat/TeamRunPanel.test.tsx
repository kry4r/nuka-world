import { describe, expect, it, vi } from "vitest";
import { TeamRunPanel } from "./TeamRunPanel";
import { findText, renderIntoDocument } from "@/test/render";
import type { TeamRunRecord } from "@/lib/team";

function sampleRun(): TeamRunRecord {
  return {
    id: "run-release",
    teamId: "team-release",
    title: "Release Team Run",
    goal: "Ship the release cleanly",
    status: "waiting_for_user",
    currentPhase: "review",
    leadAgentId: "agent-coordinator",
    charter: {
      goal: "Ship the release cleanly",
      successCriteria: "Release notes are ready",
      outputFormat: "checkpoint_summary",
      currentPhase: "review",
      maxRounds: 4,
      maxActiveAgentsPerRound: 2,
      maxMessagesPerAgentPerRound: 2,
      budgetPolicy: "pause_on_budget_warning",
      stopConditions: ["completed"],
    },
    createdAt: "2026-03-13T00:00:00Z",
    updatedAt: "2026-03-13T00:05:00Z",
    routing: null,
    agents: [
      {
        id: "agent-coordinator",
        runId: "run-release",
        sourceAgentId: "agent-coordinator",
        sourceTeamAssignmentId: "assign-coordinator",
        sourceTeamAgentId: "team-agent-coordinator",
        name: "Coordinator",
        role: "Coordinator",
        responsibility: "Drive the release round",
        systemPrompt: "Coordinate the release round.",
        toolBindings: [],
        toolUsePolicy: {
          maxCallsPerRound: 1,
          summarizeOutput: true,
        },
        status: "done",
        currentWork: "Completed current round",
        lastToolActivity: "session_artifacts",
        joinedAt: "2026-03-13T00:00:00Z",
      },
    ],
    events: [
      {
        id: "event-file-checkpoint",
        runId: "run-release",
        kind: "file_change",
        agentId: "agent-coordinator",
        title: "Round 1",
        content: "checkpoint.md",
        status: "created",
        toolName: "session_artifacts",
        toolCallId: "round-1",
        toolTarget: "C:\\\\nuka\\\\team-runs\\\\run-release\\\\round-01\\\\checkpoint.md",
        sequence: 3,
        createdAt: "2026-03-13T00:02:00Z",
      },
      {
        id: "event-file-card",
        runId: "run-release",
        kind: "file_change",
        agentId: "agent-coordinator",
        title: "Round 1",
        content: "position-card-coordinator.md",
        status: "created",
        toolName: "session_artifacts",
        toolCallId: "round-1",
        toolTarget: "C:\\\\nuka\\\\team-runs\\\\run-release\\\\round-01\\\\position-card-coordinator.md",
        sequence: 4,
        createdAt: "2026-03-13T00:02:05Z",
      },
      {
        id: "event-checkpoint",
        runId: "run-release",
        kind: "checkpoint_summary",
        agentId: "agent-coordinator",
        title: "Round 1 checkpoint",
        content: "Checkpoint ready",
        status: "completed",
        toolName: null,
        toolCallId: null,
        toolTarget: null,
        sequence: 5,
        createdAt: "2026-03-13T00:03:00Z",
      },
    ],
  };
}

describe("TeamRunPanel", () => {
  it("renders a file timeline grouped by round for active run artifacts", async () => {
    const view = await renderIntoDocument(
      <TeamRunPanel
        isBusy={false}
        onAddAgent={vi.fn()}
        onContinue={vi.fn()}
        run={sampleRun()}
      />,
    );

    expect(findText(view.container, "File timeline")).toBeTruthy();
    expect(findText(view.container, "Round 1")).toBeTruthy();
    expect(findText(view.container, "checkpoint.md")).toBeTruthy();
    expect(findText(view.container, "created")).toBeTruthy();

    await view.cleanup();
  });
});
