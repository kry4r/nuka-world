import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamRunPanel } from "./TeamRunPanel";
import { findText, renderIntoDocument } from "@/test/render";
import type { TeamRunRecord } from "@/lib/team";

const DESKTOP_LOCALE_STORAGE_KEY = "nuka.desktop.locale";

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
        toolTarget:
          "C:\\\\nuka\\\\team-runs\\\\run-release\\\\round-01\\\\checkpoint.md",
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
        toolTarget:
          "C:\\\\nuka\\\\team-runs\\\\run-release\\\\round-01\\\\position-card-coordinator.md",
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
      node.textContent?.trim() === text ||
      node.getAttribute("aria-label") === text,
  ) as HTMLButtonElement | undefined;

  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "en-US");
});

afterEach(() => {
  window.localStorage.clear();
});

describe("TeamRunPanel", () => {
  it("keeps the conversation view focused on run details and transcript content", async () => {
    const view = await renderIntoDocument(
      <TeamRunPanel
        isBusy={false}
        onAddAgent={vi.fn()}
        onContinue={vi.fn()}
        run={sampleRun()}
      />,
    );

    const viewScroll = view.container.querySelector(
      ".team-run-panel__view-scroll",
    );
    const strip = view.container.querySelector(".agent-team-strip");
    const charter = view.container.querySelector(".run-charter-card");
    const feed = view.container.querySelector(".run-event-feed");
    const viewSummary = view.container.querySelector(
      ".team-run-panel__views-summary",
    );
    const statusLight = view.container.querySelector(
      ".run-event-feed__status-light",
    );
    const statusPill = view.container.querySelector(".run-event-feed__status");
    const charterSummary = view.container.querySelector(
      ".run-charter-card__summary",
    );
    const charterGoalPanel = view.container.querySelector(
      ".run-charter-card__goal-panel",
    );
    const charterStopList = view.container.querySelector(
      ".run-charter-card__stop-list",
    );

    expect(viewScroll).toBeTruthy();
    expect(viewScroll?.contains(strip ?? null)).toBe(false);
    expect(viewScroll?.contains(charter ?? null)).toBe(true);
    expect(viewScroll?.contains(feed ?? null)).toBe(true);
    expect(viewSummary).toBeFalsy();
    expect(statusLight).toBeTruthy();
    expect(statusPill).toBeFalsy();
    expect(charterSummary?.textContent?.includes("Waiting for input")).toBe(
      false,
    );
    expect(charterSummary?.textContent?.includes("Review")).toBe(false);
    expect(findText(view.container, "Show the run context")).toBeFalsy();
    expect(findText(view.container, "Current work")).toBeFalsy();
    expect(findText(view.container, "Add Agent")).toBeFalsy();
    expect(
      view.container.querySelector(".run-event-feed__identity-line"),
    ).toBeTruthy();
    expect(charterGoalPanel).toBeTruthy();
    expect(charterStopList?.textContent).toContain("Completed");
    expect(findText(view.container, "Coordinator")).toBeTruthy();

    await view.cleanup();
  });

  it("renders structured run details as readable Chinese lists instead of raw protocol strings", async () => {
    window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "zh-CN");
    const run = sampleRun();
    run.currentPhase = "analysis";
    run.charter.successCriteria = JSON.stringify([
      "聊天主路径通过验收",
      "memory 召回结果稳定",
    ]);
    run.charter.outputFormat = "checkpoint_summary";
    run.charter.stopConditions = ["waiting_for_user", "completed"];

    const view = await renderIntoDocument(
      <TeamRunPanel
        isBusy={false}
        onAddAgent={vi.fn()}
        onContinue={vi.fn()}
        run={run}
      />,
    );

    const successList = view.container.querySelector(
      ".run-charter-card__metric-list",
    );
    const stopList = view.container.querySelector(
      ".run-charter-card__stop-list",
    );

    expect(successList?.textContent).toContain("聊天主路径通过验收");
    expect(successList?.textContent).toContain("memory 召回结果稳定");
    expect(view.container.textContent).toContain("检查点总结");
    expect(stopList?.textContent).toContain("等待输入");
    expect(stopList?.textContent).toContain("已完成");
    expect(view.container.textContent?.includes("[")).toBe(false);

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
      {
        id: "event-reviewer-instruction",
        runId: "run-release",
        kind: "user_instruction",
        agentId: "agent-reviewer",
        title: "Reviewer brief",
        content: "Check the final notes before sign-off.",
        status: null,
        toolName: null,
        toolCallId: null,
        toolTarget: null,
        sequence: 2,
        createdAt: "2026-03-13T00:01:30Z",
      },
      {
        id: "event-reviewer-thinking",
        runId: "run-release",
        kind: "position_card",
        agentId: "agent-reviewer",
        title: "Reviewer reasoning",
        content: "Verify the sign-off owner and note gaps.",
        status: "thinking",
        toolName: null,
        toolCallId: null,
        toolTarget: null,
        sequence: 3,
        createdAt: "2026-03-13T00:02:00Z",
      },
      {
        id: "event-reviewer-reply",
        runId: "run-release",
        kind: "checkpoint_summary",
        agentId: "agent-reviewer",
        title: "Reviewer update",
        content: "The release note draft is ready for final review.",
        status: "completed",
        toolName: null,
        toolCallId: null,
        toolTarget: null,
        sequence: 4,
        createdAt: "2026-03-13T00:02:30Z",
      },
      {
        id: "event-reviewer-tool",
        runId: "run-release",
        kind: "checkpoint_summary",
        agentId: "agent-reviewer",
        title: "Saved review artifact",
        content: "Saved the review notes for the team run.",
        status: "completed",
        toolName: "session_artifacts",
        toolCallId: "round-1-reviewer",
        toolTarget:
          "C:\\\\\\\\nuka\\\\\\\\team-runs\\\\\\\\run-release\\\\\\\\round-01\\\\\\\\reviewer-notes.md",
        sequence: 5,
        createdAt: "2026-03-13T00:02:40Z",
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

    expect(
      view.container.querySelector(".team-run-panel__status-overview"),
    ).toBeTruthy();
    expect(
      view.container.querySelector(".team-run-panel__status-light"),
    ).toBeTruthy();
    expect(findText(view.container, "Needs your follow-up")).toBeTruthy();
    expect(findText(view.container, "Latest checkpoint")).toBeTruthy();
    expect(
      findText(
        view.container,
        "Send the next follow-up from the composer below.",
      ),
    ).toBeTruthy();
    expect(findText(view.container, "Run blocked")).toBeTruthy();
    expect(findText(view.container, "Run status")).toBeFalsy();
    expect(findText(view.container, "Run details")).toBeFalsy();
    expect(view.container.querySelector(".run-charter-card")).toBeFalsy();
    expect(
      view.container.querySelector(
        ".team-run-panel__status-header .status-badge",
      ),
    ).toBeFalsy();

    await clickButton(view.container, "Agents");

    const agentsLayout = view.container.querySelector(
      ".team-run-panel__agents-layout",
    );
    const agentRoster = view.container.querySelector(".agent-team-strip");
    const agentTimeline = view.container.querySelector(
      ".team-run-panel__agent-timeline",
    );
    const viewScroll = view.container.querySelector(
      ".team-run-panel__view-scroll",
    );
    const composer = view.container.querySelector(".team-run-panel__composer");

    expect(agentsLayout).toBeTruthy();
    expect(agentRoster).toBeTruthy();
    expect(agentTimeline).toBeTruthy();
    expect(viewScroll?.contains(composer ?? null)).toBe(false);
    expect(findText(view.container, "Lead agent")).toBeFalsy();
    expect(findText(view.container, "Current work")).toBeFalsy();
    expect(findText(view.container, "Latest update")).toBeFalsy();
    expect(findText(view.container, "Tool state")).toBeFalsy();
    expect(findText(view.container, "Responsibility")).toBeFalsy();
    expect(findText(view.container, "Add Agent")).toBeFalsy();

    await clickButton(view.container, "Reviewer");

    const selectedAgent = view.container.querySelector(
      '.agent-team-strip__item[aria-pressed="true"]',
    );
    const eventKinds = Array.from(
      view.container.querySelectorAll(".run-event-feed__item"),
    ).map((node) => node.getAttribute("data-event-card-kind"));

    expect(selectedAgent?.textContent).toContain("Reviewer");
    expect(findText(view.container, "Reviewer brief")).toBeTruthy();
    expect(findText(view.container, "Reviewer reasoning")).toBeTruthy();
    expect(findText(view.container, "Reviewer update")).toBeTruthy();
    expect(findText(view.container, "Saved review artifact")).toBeTruthy();
    expect(findText(view.container, "Run blocked")).toBeTruthy();
    expect(findText(view.container, "Reviewer → Team")).toBeTruthy();
    expect(
      findText(view.container, "Reviewer → Session Artifacts"),
    ).toBeTruthy();
    expect(
      view.container.querySelector(".run-event-feed__relationship"),
    ).toBeTruthy();
    expect(eventKinds).toContain("instruction");
    expect(eventKinds).toContain("thinking");
    expect(eventKinds).toContain("reply");
    expect(eventKinds).toContain("tool");
    expect(eventKinds).toContain("status");

    await clickButton(view.container, "Files");

    expect(findText(view.container, "File timeline")).toBeTruthy();
    expect(
      view.container.querySelector(".team-run-panel__files-layout"),
    ).toBeTruthy();
    expect(
      view.container.querySelector(".team-run-panel__files-tree"),
    ).toBeTruthy();
    expect(
      view.container.querySelector(".team-run-panel__file-preview"),
    ).toBeTruthy();
    expect(findText(view.container, "Round 1")).toBeTruthy();
    expect(findText(view.container, "checkpoint.md")).toBeTruthy();
    expect(findText(view.container, "Diff preview unavailable")).toBeTruthy();

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

    const filesLayout = view.container.querySelector(
      ".team-run-panel__files-layout",
    );
    expect(filesLayout).toBeTruthy();
    expect(findText(view.container, "Round 1")).toBeTruthy();
    expect(findText(view.container, "checkpoint.md")).toBeTruthy();
    expect(
      findText(view.container, "position-card-coordinator.md"),
    ).toBeTruthy();
    expect(findText(view.container, "Diff preview unavailable")).toBeTruthy();

    await clickButton(view.container, "position-card-coordinator.md");

    const selectedFile = view.container.querySelector(
      ".team-run-panel__file-row.is-selected",
    );
    expect(selectedFile?.textContent).toContain("position-card-coordinator.md");

    await view.cleanup();
  });

  it("keeps the file change status badge in a dedicated inline chip", async () => {
    window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "zh-CN");
    const view = await renderIntoDocument(
      <TeamRunPanel
        isBusy={false}
        onAddAgent={vi.fn()}
        onContinue={vi.fn()}
        run={sampleRun()}
      />,
    );

    await clickButton(view.container, "文件");

    const statusBadge = view.container.querySelector(
      ".team-run-panel__file-status",
    );

    expect(statusBadge?.textContent?.trim()).toBe("新增");
    expect(
      statusBadge?.classList.contains("team-run-panel__file-status--inline"),
    ).toBe(true);

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
          "## Checkpoint Summary (≤3 agents)",
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
        toolTarget:
          "C:\\\\nuka\\\\team-runs\\\\run-release\\\\round-02\\\\checkpoint.md",
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

  it("keeps per-agent history visible after compaction by projecting compacted summaries into the agents timeline", async () => {
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
        status: "done",
        currentWork: "Completed current round",
        lastToolActivity: "session_artifacts",
        joinedAt: "2026-03-13T00:01:00Z",
      },
    ];
    run.events = [
      {
        id: "event-compacted-reviewer",
        runId: "run-release",
        kind: "compaction_summary",
        agentId: null,
        title: "Compacted context",
        content: [
          "Compacted earlier team run context (4 events):",
          "- user_instruction / User follow-up: Review the final notes carefully.",
          "- round_agenda / Coordinator agenda: Round agenda: focus on Review the final notes carefully. and synthesize a checkpoint with at most 3 agents.",
          "- position_card / Reviewer position card: Reviewer confirms the release notes are accurate.",
          "- checkpoint_summary / Checkpoint summary: Review checkpoint ready.",
        ].join("\n"),
        status: "completed",
        toolName: null,
        toolCallId: null,
        toolTarget: null,
        sequence: 1,
        createdAt: "2026-03-13T00:01:00Z",
      },
      {
        id: "event-reviewer-artifact",
        runId: "run-release",
        kind: "file_change",
        agentId: "agent-reviewer",
        title: "Round 1",
        content: "reviewer-notes.md",
        status: "created",
        toolName: "session_artifacts",
        toolCallId: "round-1-reviewer",
        toolTarget:
          "C:\\\\nuka\\\\team-runs\\\\run-release\\\\round-01\\\\reviewer-notes.md",
        sequence: 2,
        createdAt: "2026-03-13T00:02:00Z",
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

    await clickButton(view.container, "Agents");
    await clickButton(view.container, "Reviewer");

    const selectedAgent = view.container.querySelector(
      '.agent-team-strip__item[aria-pressed="true"]',
    );
    const eventKinds = Array.from(
      view.container.querySelectorAll(".run-event-feed__item"),
    ).map((node) => node.getAttribute("data-event-card-kind"));

    expect(selectedAgent?.textContent).toContain("Reviewer");
    expect(selectedAgent?.textContent).toContain("Reviewer position card");
    expect(selectedAgent?.textContent).toContain(
      "Reviewer confirms the release notes are accurate.",
    );
    expect(
      findText(view.container, "Review the final notes carefully."),
    ).toBeTruthy();
    expect(
      findText(
        view.container,
        "Reviewer confirms the release notes are accurate.",
      ),
    ).toBeTruthy();
    expect(findText(view.container, "Review checkpoint ready.")).toBeTruthy();
    expect(findText(view.container, "reviewer-notes.md")).toBeTruthy();
    expect(eventKinds).toContain("instruction");
    expect(eventKinds).toContain("reply");
    expect(eventKinds).toContain("tool");

    await view.cleanup();
  });

  it("expands compacted multi-agent transcripts into individual conversation cards instead of one raw summary blob", async () => {
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
        status: "done",
        currentWork: "Completed current round",
        lastToolActivity: "session_artifacts",
        joinedAt: "2026-03-13T00:01:00Z",
      },
    ];
    run.events = [
      {
        id: "event-compacted-conversation",
        runId: "run-release",
        kind: "compaction_summary",
        agentId: null,
        title: "Compacted context",
        content: [
          "Compacted earlier team run context (4 events):",
          "- user_instruction / User follow-up: Review the final notes carefully.",
          "- round_agenda / Coordinator agenda: Round agenda: focus on Review the final notes carefully. and synthesize a checkpoint with at most 3 agents.",
          "- position_card / Reviewer position card: Reviewer confirms the release notes are accurate.",
          "- checkpoint_summary / Checkpoint summary: Review checkpoint ready.",
        ].join("\n"),
        status: "completed",
        toolName: null,
        toolCallId: null,
        toolTarget: null,
        sequence: 1,
        createdAt: "2026-03-13T00:01:00Z",
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

    const eventKinds = Array.from(
      view.container.querySelectorAll(".run-event-feed__item"),
    ).map((node) => node.getAttribute("data-event-card-kind"));

    expect(findText(view.container, "Review the final notes carefully.")).toBeTruthy();
    expect(
      findText(view.container, "Reviewer confirms the release notes are accurate."),
    ).toBeTruthy();
    expect(findText(view.container, "Review checkpoint ready.")).toBeTruthy();
    expect(eventKinds).toContain("instruction");
    expect(eventKinds).toContain("reply");
    expect(view.container.textContent?.includes("user_instruction / User follow-up")).toBe(
      false,
    );
    expect(view.container.textContent?.includes("position_card / Reviewer position card")).toBe(
      false,
    );
    expect(view.container.textContent?.includes("checkpoint_summary / Checkpoint summary")).toBe(
      false,
    );

    await view.cleanup();
  });

  it("keeps compacted conversation cards branchable by mapping them back to the source summary event", async () => {
    const run = sampleRun();
    const onBranchEvent = vi.fn();
    run.events = [
      {
        id: "event-compacted-branchable",
        runId: "run-release",
        kind: "compaction_summary",
        agentId: null,
        title: "Compacted context",
        content: [
          "Compacted earlier team run context (3 events):",
          "- user_instruction / User follow-up: Review the final notes carefully.",
          "- round_agenda / Coordinator agenda: Round agenda: focus on Review the final notes carefully.",
          "- checkpoint_summary / Checkpoint summary: Review checkpoint ready.",
        ].join("\n"),
        status: "completed",
        toolName: null,
        toolCallId: null,
        toolTarget: null,
        sequence: 1,
        createdAt: "2026-03-13T00:01:00Z",
      },
    ];

    const view = await renderIntoDocument(
      <TeamRunPanel
        isBusy={false}
        onAddAgent={vi.fn()}
        onBranchEvent={onBranchEvent}
        onContinue={vi.fn()}
        run={run}
      />,
    );

    const branchButtons = Array.from(
      view.container.querySelectorAll('[aria-label="Branch from this event"]'),
    ) as HTMLButtonElement[];

    expect(branchButtons.length).toBeGreaterThan(0);

    await act(async () => {
      branchButtons[0]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(onBranchEvent).toHaveBeenCalledWith("event-compacted-branchable");

    await view.cleanup();
  });

  it("keeps the compacted conversation card localized in Chinese without repeating the raw title", async () => {
    window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "zh-CN");
    const run = sampleRun();
    run.events = [
      {
        id: "event-compacted",
        runId: "run-release",
        kind: "compaction_summary",
        agentId: null,
        title: "Compacted context",
        content:
          "较早的协作团队上下文已压缩为 3 条摘要，方便继续查看最新进展。",
        status: "completed",
        toolName: null,
        toolCallId: null,
        toolTarget: null,
        sequence: 1,
        createdAt: "2026-03-13T00:01:00Z",
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

    expect(findText(view.container, "压缩上下文")).toBeTruthy();
    expect(findText(view.container, "Compacted context")).toBeFalsy();
    expect(view.container.textContent).toContain(
      "较早的协作团队上下文已压缩为 3 条摘要",
    );

    await view.cleanup();
  });

  it("humanizes compacted run-start titles inside the Chinese agents timeline", async () => {
    window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "zh-CN");
    const run = sampleRun();
    run.agents = [
      ...run.agents,
      {
        id: "agent-reviewer",
        runId: "run-release",
        sourceAgentId: "agent-reviewer",
        sourceTeamAssignmentId: "assign-reviewer",
        sourceTeamAgentId: "team-agent-reviewer",
        name: "聊天验收执行员",
        role: "Executor Agent",
        responsibility: "核对聊天主路径是否符合 P0。",
        systemPrompt: "检查聊天主路径。",
        toolBindings: [],
        toolUsePolicy: {
          maxCallsPerRound: 1,
          summarizeOutput: true,
        },
        status: "done",
        currentWork: "Completed current round",
        lastToolActivity: null,
        joinedAt: "2026-03-13T00:01:00Z",
      },
    ];
    run.events = [
      {
        id: "event-compacted-run-start",
        runId: "run-release",
        kind: "compaction_summary",
        agentId: null,
        title: "Compacted context",
        content: [
          "Compacted earlier team run context (2 events):",
          "- run_started / Team run started: Started run from team Smoke Validation Team",
          "- position_card / 聊天验收执行员 position card: 继续按中文验收流程推进。",
        ].join("\n"),
        status: "completed",
        toolName: null,
        toolCallId: null,
        toolTarget: null,
        sequence: 1,
        createdAt: "2026-03-13T00:01:00Z",
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

    await clickButton(view.container, "智能体");
    await clickButton(view.container, "聊天验收执行员");

    expect(findText(view.container, "运行开始")).toBeTruthy();
    expect(findText(view.container, "Team run started")).toBeFalsy();

    await view.cleanup();
  });

  it("humanizes compacted protocol copy in Chinese instead of leaking raw English status strings", async () => {
    window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "zh-CN");
    const run = sampleRun();
    run.events = [
      {
        id: "event-compacted-protocol",
        runId: "run-release",
        kind: "compaction_summary",
        agentId: null,
        title: "Checkpoint summary",
        content: [
          "Started run from team Smoke Validation Team",
          "User follow-up: 继续验证桌面 P0 主路径。",
          "Run heartbeat: Executing prompt: 继续验证桌面 P0 主路径。",
          "Connection checks passed for Freestyle Codex.",
          "Round agenda: focus on 继续验证桌面 P0 主路径。 and synthesize a checkpoint with...",
          "Conditional Pass",
          "Scheduler Agent",
          "Executor Agent",
        ].join("\n"),
        status: "completed",
        toolName: null,
        toolCallId: null,
        toolTarget: null,
        sequence: 1,
        createdAt: "2026-03-13T00:01:00Z",
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

    expect(view.container.textContent).toContain(
      "已从协作团队 Smoke Validation Team 启动运行",
    );
    expect(view.container.textContent).toContain("用户跟进");
    expect(view.container.textContent).toContain("运行心跳");
    expect(view.container.textContent).toContain(
      "Freestyle Codex 连接预检已通过。",
    );
    expect(view.container.textContent).toContain(
      "轮次议程：围绕 继续验证桌面 P0 主路径。 推进，并整理一份检查点总结。",
    );
    expect(view.container.textContent).toContain("条件通过");
    expect(view.container.textContent).toContain("调度智能体");
    expect(view.container.textContent).toContain("执行智能体");
    expect(view.container.textContent?.includes("Started run from team")).toBe(
      false,
    );
    expect(view.container.textContent?.includes("User follow-up")).toBe(false);
    expect(view.container.textContent?.includes("Run heartbeat")).toBe(false);
    expect(
      view.container.textContent?.includes("Connection checks passed"),
    ).toBe(false);
    expect(view.container.textContent?.includes("Round agenda")).toBe(false);
    expect(view.container.textContent?.includes("Conditional Pass")).toBe(
      false,
    );

    await view.cleanup();
  });

  it("humanizes scheduler and executor labels in the Chinese agents view", async () => {
    window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "zh-CN");
    const run = sampleRun();
    run.agents = [
      {
        ...run.agents[0],
        name: "验收调度官",
        role: "Scheduler Agent",
        currentWork: "Completed current round",
      },
      {
        id: "agent-executor",
        runId: "run-release",
        sourceAgentId: "agent-executor",
        sourceTeamAssignmentId: "assign-executor",
        sourceTeamAgentId: "team-agent-executor",
        name: "聊天验收执行员",
        role: "Executor Agent",
        responsibility: "核对聊天主路径是否符合 P0。",
        systemPrompt: "检查聊天主路径。",
        toolBindings: [],
        toolUsePolicy: {
          maxCallsPerRound: 1,
          summarizeOutput: true,
        },
        status: "waiting",
        currentWork: "Waiting for coordinator",
        lastToolActivity: null,
        joinedAt: "2026-03-13T00:01:00Z",
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

    await clickButton(view.container, "智能体");

    expect(findText(view.container, "调度智能体")).toBeTruthy();
    expect(findText(view.container, "执行智能体")).toBeTruthy();
    expect(findText(view.container, "已完成当前轮次")).toBeTruthy();
    await clickButton(view.container, "聊天验收执行员");
    expect(findText(view.container, "等待协调")).toBeTruthy();
    expect(findText(view.container, "Scheduler Agent")).toBeFalsy();
    expect(findText(view.container, "Executor Agent")).toBeFalsy();
    expect(findText(view.container, "Completed current round")).toBeFalsy();
    expect(findText(view.container, "Waiting for coordinator")).toBeFalsy();

    await view.cleanup();
  });

  it("localizes live status card eyebrows in Chinese and keeps dotted provider names intact", async () => {
    window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "zh-CN");
    const run = sampleRun();
    run.events = [
      {
        id: "event-run-heartbeat-live",
        runId: "run-release",
        kind: "run_heartbeat",
        agentId: null,
        title: "Run heartbeat",
        content: "Executing prompt: 启动这一轮协作团队运行。",
        status: "completed",
        toolName: null,
        toolCallId: null,
        toolTarget: null,
        sequence: 1,
        createdAt: "2026-03-13T00:01:00Z",
      },
      {
        id: "event-provider-check-live",
        runId: "run-release",
        kind: "provider_check_passed",
        agentId: null,
        title: "Provider preflight",
        content: "Connection checks passed for Zenscale GPT-5.2.",
        status: "completed",
        toolName: null,
        toolCallId: null,
        toolTarget: null,
        sequence: 2,
        createdAt: "2026-03-13T00:02:00Z",
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

    expect(view.container.textContent).toContain("运行心跳");
    expect(view.container.textContent).toContain("提供方预检通过");
    expect(view.container.textContent).toContain("Zenscale GPT-5.2 连接预检已通过。");
    expect(view.container.textContent?.includes("Run Heartbeat")).toBe(false);
    expect(view.container.textContent?.includes("Provider Check Passed")).toBe(false);
    expect(view.container.textContent?.includes("Zenscale GPT-5 连接预检已通过。2.")).toBe(
      false,
    );

    await view.cleanup();
  });

  it("renders the latest checkpoint in Status view with markdown instead of raw tokens", async () => {
    const run = sampleRun();
    run.events = [
      {
        id: "event-checkpoint-status-markdown",
        runId: "run-release",
        kind: "checkpoint_summary",
        agentId: "agent-coordinator",
        title: "Checkpoint summary",
        content: [
          "## Checkpoint Summary (≤3 agents)",
          "",
          "**Agreed Team Structure**",
          "",
          "| Role | Agent |",
          "|------|-------|",
          "| Driver | Coordinator |",
          "| Validator | Reviewer |",
        ].join("\n"),
        status: "completed",
        toolName: null,
        toolCallId: null,
        toolTarget: null,
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

    await clickButton(view.container, "Status");

    const latestCheckpointCard = view.container.querySelector(
      ".team-run-panel__status-card",
    );

    expect(latestCheckpointCard?.querySelector("table")).toBeTruthy();
    expect(findText(view.container, "Driver")).toBeTruthy();
    expect(findText(view.container, "Coordinator")).toBeTruthy();
    expect(findText(view.container, "## Checkpoint Summary")).toBeFalsy();
    expect(
      latestCheckpointCard?.textContent?.match(/checkpoint summary/gi)
        ?.length ?? 0,
    ).toBe(1);

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
    expect(
      findText(view.container, "Check the unresolved sign-off owner"),
    ).toBeFalsy();
    expect(branchButton?.className).toContain("run-event-feed__branch--anchor");

    await clickButton(view.container, "Show thinking trace");

    expect(
      findText(view.container, "Check the unresolved sign-off owner"),
    ).toBeTruthy();

    await view.cleanup();
  });
});
