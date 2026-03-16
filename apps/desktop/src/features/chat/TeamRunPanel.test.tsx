import { act } from "react";
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

async function clickButton(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (node) =>
      node.textContent?.trim() === text || node.getAttribute("aria-label") === text,
  ) as HTMLButtonElement | undefined;

  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("TeamRunPanel", () => {
  it("wraps the conversation stack in a dedicated view scroll container", async () => {
    const view = await renderIntoDocument(
      <TeamRunPanel
        isBusy={false}
        onAddAgent={vi.fn()}
        onContinue={vi.fn()}
        run={sampleRun()}
      />,
    );

    const viewScroll = view.container.querySelector(".team-run-panel__view-scroll");
    const strip = view.container.querySelector(".agent-team-strip");
    const charter = view.container.querySelector(".run-charter-card");
    const feed = view.container.querySelector(".run-event-feed");
    const viewSummary = view.container.querySelector(".team-run-panel__views-summary");
    const statusLight = view.container.querySelector(".run-event-feed__status-light");
    const statusPill = view.container.querySelector(".run-event-feed__status");
    const charterSummary = view.container.querySelector(".run-charter-card__summary");

    expect(viewScroll).toBeTruthy();
    expect(viewScroll?.contains(strip ?? null)).toBe(true);
    expect(viewScroll?.contains(charter ?? null)).toBe(true);
    expect(viewScroll?.contains(feed ?? null)).toBe(true);
    expect(viewSummary).toBeFalsy();
    expect(statusLight).toBeTruthy();
    expect(statusPill).toBeFalsy();
    expect(charterSummary?.textContent?.includes("Waiting for input")).toBe(false);
    expect(charterSummary?.textContent?.includes("Review")).toBe(false);
    expect(findText(view.container, "Session work")).toBeTruthy();
    expect(findText(view.container, "Add Agent")).toBeFalsy();

    await view.cleanup();
  });

  it("renders conversation-first secondary tabs and switches between status, agents, and files", async () => {
    const run = sampleRun();
    run.agents = [
      ...run.agents,
      {
        id: "agent-reviewer",
        runId: "run-release",
        sourceAgentId: "agent-reviewer",
        sourceTeamAssignmentId: "assign-reviewer",
        sourceTeamAgentId: "team-agent-reviewer",
        name: "Reviewer",
        role: "Reviewer",
        responsibility: "Validate the final notes",
        systemPrompt: "Review the final notes.",
        toolBindings: [],
        toolUsePolicy: {
          maxCallsPerRound: 1,
          summarizeOutput: true,
        },
        status: "thinking",
        currentWork: "Checking the sign-off matrix",
        lastToolActivity: "session_artifacts",
        joinedAt: "2026-03-13T00:01:00Z",
      },
    ];
    run.events = [
      {
        id: "event-blocked",
        runId: "run-release",
        kind: "run_blocked",
        agentId: null,
        title: "Run blocked",
        content: "Waiting for provider route confirmation.",
        status: "blocked",
        toolName: null,
        toolCallId: null,
        toolTarget: null,
        sequence: 1,
        createdAt: "2026-03-13T00:01:00Z",
      },
      ...run.events,
    ];

    const view = await renderIntoDocument(
      <TeamRunPanel
        isBusy={false}
        onAddAgent={vi.fn()}
        onContinue={vi.fn()}
        run={run}
      />,
    );

    expect(findText(view.container, "Conversation")).toBeTruthy();
    expect(findText(view.container, "Status")).toBeTruthy();
    expect(findText(view.container, "Agents")).toBeTruthy();
    expect(findText(view.container, "Files")).toBeTruthy();
    expect(findText(view.container, "Round 1 checkpoint")).toBeTruthy();
    expect(findText(view.container, "File timeline")).toBeFalsy();

    await clickButton(view.container, "Status");

    expect(findText(view.container, "Waiting for input")).toBeTruthy();
    expect(findText(view.container, "Run blocked")).toBeTruthy();

    await clickButton(view.container, "Agents");

    expect(view.container.querySelector(".agent-team-strip__avatar")).toBeTruthy();
    expect(findText(view.container, "Reviewer")).toBeTruthy();
    expect(findText(view.container, "Session work")).toBeTruthy();
    expect(findText(view.container, "Add Agent")).toBeTruthy();

    await clickButton(view.container, "Files");

    expect(findText(view.container, "File timeline")).toBeTruthy();
    expect(findText(view.container, "checkpoint.md")).toBeTruthy();

    await view.cleanup();
  });

  it("renders a file timeline grouped by round for active run artifacts", async () => {
    const view = await renderIntoDocument(
      <TeamRunPanel
        isBusy={false}
        onAddAgent={vi.fn()}
        onContinue={vi.fn()}
        run={sampleRun()}
      />,
    );

    await clickButton(view.container, "Files");

    expect(findText(view.container, "File timeline")).toBeTruthy();
    expect(findText(view.container, "Round 1")).toBeTruthy();
    expect(findText(view.container, "checkpoint.md")).toBeTruthy();
    expect(findText(view.container, "created")).toBeTruthy();

    await view.cleanup();
  });

  it("renders markdown-rich team updates and humanizes raw tool activity labels", async () => {
    const run = sampleRun();
    run.events = [
      ...run.events,
      {
        id: "event-checkpoint-markdown",
        runId: "run-release",
        kind: "checkpoint_summary",
        agentId: "agent-coordinator",
        title: "Checkpoint summary",
        content: [
          "## Checkpoint Summary",
          "",
          "**Agreed Team Structure**",
          "",
          "| Role | Agent |",
          "|------|-------|",
          "| Driver | Coordinator |",
          "| Validator | Reviewer |",
        ].join("\n"),
        status: "completed",
        toolName: "session_artifacts",
        toolCallId: "round-2",
        toolTarget: "C:\\\\nuka\\\\team-runs\\\\run-release\\\\round-02\\\\checkpoint.md",
        sequence: 6,
        createdAt: "2026-03-13T00:04:00Z",
      },
    ];

    const view = await renderIntoDocument(
      <TeamRunPanel
        isBusy={false}
        onAddAgent={vi.fn()}
        onContinue={vi.fn()}
        run={run}
      />,
    );

    expect(view.container.querySelector("table")).toBeTruthy();
    expect(findText(view.container, "Driver")).toBeTruthy();
    expect(findText(view.container, "Coordinator")).toBeTruthy();
    expect(findText(view.container, "session_artifacts")).toBeFalsy();
    expect(findText(view.container, "Session Artifacts")).toBeTruthy();

    await view.cleanup();
  });

  it("renders thinking updates as disclosures and uses an anchor-style branch affordance", async () => {
    const run = sampleRun();
    run.events = [
      {
        id: "event-thinking",
        runId: "run-release",
        kind: "position_card",
        agentId: "agent-coordinator",
        title: "Coordinator reasoning",
        content: [
          "## Thinking",
          "",
          "- Check the unresolved sign-off owner",
          "- Verify the draft release note path",
        ].join("\n"),
        status: "thinking",
        toolName: null,
        toolCallId: null,
        toolTarget: null,
        sequence: 1,
        createdAt: "2026-03-13T00:03:00Z",
      },
    ];

    const view = await renderIntoDocument(
      <TeamRunPanel
        isBusy={false}
        onAddAgent={vi.fn()}
        onBranchEvent={vi.fn()}
        onContinue={vi.fn()}
        run={run}
      />,
    );

    const branchButton = view.container.querySelector(
      '[aria-label="Branch from this event"]',
    ) as HTMLButtonElement | null;

    expect(findText(view.container, "Thinking")).toBeTruthy();
    expect(findText(view.container, "Check the unresolved sign-off owner")).toBeFalsy();
    expect(branchButton?.className).toContain("run-event-feed__branch--anchor");

    await clickButton(view.container, "Show thinking trace");

    expect(findText(view.container, "Check the unresolved sign-off owner")).toBeTruthy();

    await view.cleanup();
  });
});
