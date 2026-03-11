import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findText, renderIntoDocument } from "@/test/render";
import { TeamPage } from "./TeamPage";

const sampleTeam = {
  id: "team-release",
  name: "Release Team",
  goal: "Ship the release and publish notes",
  summary: "Coordinates release validation, notes, and final publish readiness.",
  successCriteria: "Release notes are reviewed and the release checklist is complete.",
  coordinationPolicy: "Moderator-led rounds with checkpoint summaries.",
  createdAt: "2026-03-11T12:00:00Z",
  updatedAt: "2026-03-11T12:00:00Z",
  status: "draft",
  agents: [
    {
      id: "agent-moderator",
      teamId: "team-release",
      name: "Moderator",
      role: "Moderator",
      responsibility: "Keep the team focused and synthesize checkpoints.",
      systemPrompt: "Run moderated planning rounds.",
      toolBindings: [
        {
          toolId: "mcp:filesystem",
          allowed: true,
          adapterKind: "mcp",
          purpose: "Inspect release artifacts",
          costClass: "low",
        },
      ],
      toolUsePolicy: {
        maxCallsPerRound: 2,
        summarizeOutput: true,
      },
      orderHint: 0,
      createdAt: "2026-03-11T12:00:00Z",
      updatedAt: "2026-03-11T12:00:00Z",
    },
    {
      id: "agent-publisher",
      teamId: "team-release",
      name: "Publisher",
      role: "Publisher",
      responsibility: "Draft the release note output.",
      systemPrompt: "Write concise release notes.",
      toolBindings: [
        {
          toolId: "codex",
          allowed: true,
          adapterKind: "integrated",
          purpose: "Draft final copy",
          costClass: "high",
        },
      ],
      toolUsePolicy: {
        maxCallsPerRound: 1,
        summarizeOutput: true,
      },
      orderHint: 1,
      createdAt: "2026-03-11T12:00:00Z",
      updatedAt: "2026-03-11T12:00:00Z",
    },
  ],
};

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async (command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case "list_teams":
        return [];
      case "create_team_from_goal":
        return {
          ...sampleTeam,
          goal: String(args?.goal ?? sampleTeam.goal),
        };
      case "update_team":
        return args?.team ?? sampleTeam;
      case "start_team_run":
        return {
          id: "run-release",
          teamId: sampleTeam.id,
          title: "Release Team Run",
          goal: sampleTeam.goal,
          status: "active",
          currentPhase: "kickoff",
          leadAgentId: "agent-moderator",
          charter: {
            goal: sampleTeam.goal,
            successCriteria: sampleTeam.successCriteria,
            outputFormat: "Release summary",
            currentPhase: "kickoff",
            maxRounds: 6,
            maxActiveAgentsPerRound: 2,
            maxMessagesPerAgentPerRound: 2,
            budgetPolicy: "Summaries only",
            stopConditions: ["Checklist complete"],
          },
          createdAt: "2026-03-11T12:30:00Z",
          updatedAt: "2026-03-11T12:30:00Z",
          agents: [],
          events: [],
        };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  invokeMock.mockClear();

  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(text),
  );
}

async function clickButton(container: HTMLElement, text: string) {
  await act(async () => {
    findButton(container, text)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function setInputValue(container: HTMLElement, label: string, value: string) {
  const input = Array.from(container.querySelectorAll("input")).find(
    (node) => node.getAttribute("aria-label") === label,
  ) as HTMLInputElement | undefined;

  await act(async () => {
    if (!input) {
      throw new Error(`input missing: ${label}`);
    }

    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("TeamPage", () => {
  it("creates a team from a goal and lets the user edit agent tools before starting a run", async () => {
    const view = await renderIntoDocument(<TeamPage />);
    cleanups.push(view.cleanup);

    await setInputValue(view.container, "Team goal", "Ship the release and publish notes");
    await clickButton(view.container, "Generate Team");

    expect(findText(view.container, "Release Team")).toBeTruthy();
    expect(findText(view.container, "Allowed tools")).toBeTruthy();
    expect(findText(view.container, "Start Run")).toBeTruthy();
  });
});
