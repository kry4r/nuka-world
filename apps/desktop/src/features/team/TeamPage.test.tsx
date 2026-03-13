import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findText, renderIntoDocument } from "@/test/render";
import { TeamPage } from "./TeamPage";

const sampleTeam = {
  id: "team-release",
  name: "Release Team",
  goal: "Ship the release and publish notes",
  summary: "Coordinates release validation, notes, and final publish readiness.",
  promptConstraints: "Keep the team concise and evidence-first.",
  permissionPolicy: "No destructive tools without explicit approval.",
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
  agentAssignments: [
    {
      id: "assignment-moderator",
      teamId: "team-release",
      agentId: "agent-moderator",
      enabled: true,
      orderHint: 0,
      promptOverride: null,
      permissionOverrideJson: "{}",
      createdAt: "2026-03-11T12:00:00Z",
      updatedAt: "2026-03-11T12:00:00Z",
    },
    {
      id: "assignment-publisher",
      teamId: "team-release",
      agentId: "agent-publisher",
      enabled: true,
      orderHint: 1,
      promptOverride: null,
      permissionOverrideJson: "{}",
      createdAt: "2026-03-11T12:00:00Z",
      updatedAt: "2026-03-11T12:00:00Z",
    },
  ],
};

const availableAgents = [
  {
    id: "agent-moderator",
    name: "Moderator",
    description: "Keeps the team focused and synthesizes checkpoints.",
    systemPrompt: "Run moderated planning rounds.",
    providerId: "provider-local",
    toolNames: ["mcp:filesystem"],
  },
  {
    id: "agent-publisher",
    name: "Publisher",
    description: "Drafts the release note output.",
    systemPrompt: "Write concise release notes.",
    providerId: "provider-local",
    toolNames: ["codex"],
  },
  {
    id: "agent-reviewer",
    name: "Reviewer",
    description: "Checks the release package for missing evidence.",
    systemPrompt: "Review for missing evidence and consistency.",
    providerId: "provider-local",
    toolNames: ["mcp:filesystem", "codex"],
  },
];

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async (command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case "list_teams":
        return [sampleTeam];
      case "list_agents":
        return availableAgents;
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
  const input = Array.from(container.querySelectorAll("input, textarea")).find(
    (node) => node.getAttribute("aria-label") === label,
  ) as HTMLInputElement | HTMLTextAreaElement | undefined;

  await act(async () => {
    if (!input) {
      throw new Error(`input missing: ${label}`);
    }

    const prototype =
      input instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}

function captureToasts() {
  const toasts: Array<{ message?: string; tone?: string }> = [];
  const handleToast = (event: Event) => {
    toasts.push((event as CustomEvent<{ message?: string; tone?: string }>).detail);
  };

  window.addEventListener("nuka:toast", handleToast as EventListener);

  return {
    toasts,
    release: () => {
      window.removeEventListener("nuka:toast", handleToast as EventListener);
    },
  };
}

describe("TeamPage", () => {
  it("renders provider-generated template policies as structured sections instead of raw json blobs", async () => {
    invokeMock.mockImplementationOnce(async (command: string, args?: Record<string, unknown>) => {
      if (command === "list_teams") {
        return [
          {
            ...sampleTeam,
            promptConstraints: JSON.stringify(
              [
                "Only use saved tools.",
                "Keep the run bounded to one review round.",
              ],
              null,
              2,
            ),
            permissionPolicy: JSON.stringify(
              {
                allowedResources: ["/release", "/notes"],
                deniedActions: ["delete_repo"],
              },
              null,
              2,
            ),
            successCriteria: JSON.stringify(
              {
                checklistComplete: true,
                notesReviewed: true,
              },
              null,
              2,
            ),
            coordinationPolicy: JSON.stringify(
              {
                flow: "moderated",
                handoff: "Moderator finalizes the summary",
              },
              null,
              2,
            ),
          },
        ];
      }

      return invokeMock.getMockImplementation()?.(command, args);
    });

    const view = await renderIntoDocument(<TeamPage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Only use saved tools.")).toBeTruthy();
    expect(findText(view.container, "Keep the run bounded to one review round.")).toBeTruthy();
    expect(findText(view.container, "Allowed Resources")).toBeTruthy();
    expect(view.container.textContent).toContain("/release");
    expect(findText(view.container, "Checklist Complete")).toBeTruthy();
    expect(view.container.textContent).toContain("moderated");
    expect(findText(view.container, "\"allowedResources\"")).toBeFalsy();
    expect(findText(view.container, "\"checklistComplete\"")).toBeFalsy();
    expect(findText(view.container, "\"flow\"")).toBeFalsy();
  });

  it("keeps the page edit-only and saves description, constraints, and assigned agents", async () => {
    const view = await renderIntoDocument(<TeamPage />);
    cleanups.push(view.cleanup);
    const toastCapture = captureToasts();

    try {
      expect(findText(view.container, "Generate a Team from a goal")).toBeFalsy();
      expect(findText(view.container, "Generate a team from a goal to begin.")).toBeFalsy();

      await setInputValue(view.container, "Team description", "Tighten the release checklist before launch.");
      await setInputValue(view.container, "Prompt constraints", "Only cite evidence found in the workspace.");
      await setInputValue(view.container, "Permission policy", "No destructive tools and no network writes.");
      await clickButton(view.container, "Remove Publisher");
      await clickButton(view.container, "Add Reviewer");
      await clickButton(view.container, "Save Changes");

      const updateCall = invokeMock.mock.calls.find(([command]) => command === "update_team");
      expect(updateCall).toBeTruthy();

      const updatedTeam = updateCall?.[1]?.team as typeof sampleTeam;
      expect(updatedTeam.summary).toBe("Tighten the release checklist before launch.");
      expect(updatedTeam.promptConstraints).toBe("Only cite evidence found in the workspace.");
      expect(updatedTeam.permissionPolicy).toBe("No destructive tools and no network writes.");
      expect(updatedTeam.agentAssignments.map((assignment) => assignment.agentId)).toEqual([
        "agent-moderator",
        "agent-reviewer",
      ]);
      expect(updatedTeam.agents.map((agent) => agent.name)).toEqual([
        "Moderator",
        "Reviewer",
      ]);
      expect(toastCapture.toasts).toContainEqual(
        expect.objectContaining({
          message: "Team saved.",
          tone: "success",
        }),
      );
      expect(findText(view.container, "Team saved.")).toBeFalsy();
    } finally {
      toastCapture.release();
    }
  });

  it("shows persisted teams without the goal generator copy and still allows starting a run", async () => {
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");
    const view = await renderIntoDocument(<TeamPage />);
    cleanups.push(view.cleanup);
    const toastCapture = captureToasts();

    try {
      expect(findText(view.container, "Release Team")).toBeTruthy();
      expect(findText(view.container, "Allowed tools")).toBeTruthy();
      expect(findText(view.container, "Start Run")).toBeTruthy();
      expect(findText(view.container, "Provider-backed teams stay persisted and can be resumed into new runs.")).toBeFalsy();
      expect(findText(view.container, "Generate a Team from a goal")).toBeFalsy();
      expect(findText(view.container, "Generate a team from a goal to begin.")).toBeFalsy();
      expect(
        Array.from(view.container.querySelectorAll("input")).find(
          (node) => node.getAttribute("aria-label") === "Team goal",
        ),
      ).toBeUndefined();

      await clickButton(view.container, "Start Run");

      expect(toastCapture.toasts).toContainEqual(
        expect.objectContaining({
          message: "Run started: Release Team Run",
          tone: "success",
        }),
      );
      expect(findText(view.container, "Run started: Release Team Run")).toBeFalsy();
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "nuka:navigate",
          detail: expect.objectContaining({ page: "chat" }),
        }),
      );
    } finally {
      toastCapture.release();
      dispatchEventSpy.mockRestore();
    }
  });

  it("centers both empty team states inside their panels", async () => {
    invokeMock.mockImplementationOnce(async (command: string) => {
      if (command === "list_teams") {
        return [];
      }

      throw new Error(`unexpected command: ${command}`);
    });

    const view = await renderIntoDocument(<TeamPage />);
    cleanups.push(view.cleanup);

    const listEmpty = view.container.querySelector('[data-testid="team-list-empty"]');
    const editorEmpty = view.container.querySelector('[data-testid="team-editor-empty"]');

    expect(listEmpty?.textContent?.trim()).toBe("No teams yet.");
    expect(editorEmpty?.textContent?.trim()).toBe("No teams yet.");
    expect(listEmpty?.className).toContain("team-list__empty--centered");
    expect(editorEmpty?.className).toContain("team-editor__empty--centered");
  });
});
