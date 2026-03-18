import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findText, renderIntoDocument } from "@/test/render";
import { TeamPage } from "./TeamPage";

const sampleTeam = {
  id: "team-release",
  name: "Release Team",
  goal: "Ship the release and publish notes",
  summary:
    "Coordinates release validation, notes, and final publish readiness.",
  promptConstraints: JSON.stringify(
    {
      language: "zh-CN",
      mustHaveRoles: {
        executorAgentsMin: 2,
        schedulerAgents: 1,
      },
      operationalRules: [
        "Keep the team concise and evidence-first.",
        "Cite release artifacts before conclusions.",
      ],
      scope: ["release", "notes"],
    },
    null,
    2,
  ),
  permissionPolicy: JSON.stringify(
    {
      allowedResources: ["/release", "/notes"],
      deniedActions: ["delete_repo"],
      maxExecutionTimeMinutes: 20,
    },
    null,
    2,
  ),
  successCriteria: JSON.stringify(
    {
      notesReviewed: true,
      checklistComplete: true,
    },
    null,
    2,
  ),
  coordinationPolicy: JSON.stringify(
    {
      flow: "moderated",
      feedbackLoop: "Moderator reviews the draft before publish.",
      errorHandling: "Escalate blockers with evidence.",
      roleHierarchy: {
        moderator: "lead",
        publisher: "writer",
      },
    },
    null,
    2,
  ),
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
      case "list_workspace_sessions":
        return [
          {
            id: "run-release",
            kind: "team_run",
            title: "Release Team Run",
            status: "running",
            updatedAt: "2026-03-11T12:31:00Z",
          },
        ];
      case "load_team_run":
        return {
          id: "run-release",
          teamId: sampleTeam.id,
          title: "Release Team Run",
          goal: sampleTeam.goal,
          status: "running",
          currentPhase: "review",
          leadAgentId: "agent-moderator",
          charter: {
            goal: sampleTeam.goal,
            successCriteria: sampleTeam.successCriteria,
            outputFormat: "Release summary",
            currentPhase: "review",
            maxRounds: 6,
            maxActiveAgentsPerRound: 2,
            maxMessagesPerAgentPerRound: 2,
            budgetPolicy: "Summaries only",
            stopConditions: ["Checklist complete"],
          },
          createdAt: "2026-03-11T12:30:00Z",
          updatedAt: "2026-03-11T12:31:00Z",
          routing: null,
          agents: [],
          events: [],
        };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) =>
    invokeMock(command, args),
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
    findButton(container, text)?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function setInputValue(
  container: HTMLElement,
  label: string,
  value: string,
) {
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
    toasts.push(
      (event as CustomEvent<{ message?: string; tone?: string }>).detail,
    );
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
  it("humanizes scheduler and executor copy inside the team editor", async () => {
    const originalRoles = sampleTeam.agents.map((agent) => agent.role);
    const originalResponsibilities = sampleTeam.agents.map(
      (agent) => agent.responsibility,
    );

    sampleTeam.agents[0]!.role = "Scheduler Agent";
    sampleTeam.agents[0]!.responsibility =
      "Contribute as Scheduler Agent for the team goal.";
    sampleTeam.agents[1]!.role = "Executor Agent";
    sampleTeam.agents[1]!.responsibility =
      "Contribute as Executor Agent for the team goal.";

    const view = await renderIntoDocument(<TeamPage />);
    cleanups.push(view.cleanup);

    try {
      expect(findText(view.container, "调度智能体")).toBeTruthy();
      expect(findText(view.container, "执行智能体")).toBeTruthy();
      expect(
        findText(view.container, "以调度智能体身份推进当前协作团队目标。"),
      ).toBeTruthy();
      expect(
        findText(view.container, "以执行智能体身份推进当前协作团队目标。"),
      ).toBeTruthy();
      expect(
        findText(view.container, "Contribute as Scheduler Agent"),
      ).toBeFalsy();
      expect(
        findText(view.container, "Contribute as Executor Agent"),
      ).toBeFalsy();
    } finally {
      sampleTeam.agents[0]!.role = originalRoles[0]!;
      sampleTeam.agents[0]!.responsibility = originalResponsibilities[0]!;
      sampleTeam.agents[1]!.role = originalRoles[1]!;
      sampleTeam.agents[1]!.responsibility = originalResponsibilities[1]!;
    }
  });

  it("humanizes generic coordinator fallback copy inside the team editor", async () => {
    const originalRole = sampleTeam.agents[0]!.role;
    const originalResponsibility = sampleTeam.agents[0]!.responsibility;

    sampleTeam.agents[0]!.role = "Coordinator";
    sampleTeam.agents[0]!.responsibility =
      "Contribute as Coordinator for the team goal.";

    const view = await renderIntoDocument(<TeamPage />);
    cleanups.push(view.cleanup);

    try {
      expect(findText(view.container, "协调者")).toBeTruthy();
      expect(
        findText(view.container, "以协调者身份推进当前协作团队目标。"),
      ).toBeTruthy();
      expect(
        findText(
          view.container,
          "Contribute as Coordinator for the team goal.",
        ),
      ).toBeFalsy();
    } finally {
      sampleTeam.agents[0]!.role = originalRole;
      sampleTeam.agents[0]!.responsibility = originalResponsibility;
    }
  });

  it("renders prompt constraints as structured fields and exposes recent launches as chat entries", async () => {
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");
    const view = await renderIntoDocument(<TeamPage />);
    cleanups.push(view.cleanup);

    try {
      expect(
        view.container.querySelector('input[aria-label="工作语言"]'),
      ).toBeTruthy();
      expect(
        view.container.querySelector('input[aria-label="调度智能体数量"]'),
      ).toBeTruthy();
      expect(
        view.container.querySelector('input[aria-label="执行智能体最少数量"]'),
      ).toBeTruthy();
      expect(
        view.container.querySelector('input[aria-label="工作规则 1"]'),
      ).toBeTruthy();
      expect(
        view.container.querySelector('input[aria-label="覆盖范围 1"]'),
      ).toBeTruthy();
      expect(findText(view.container, '"language"')).toBeFalsy();
      expect(findText(view.container, "最近启动")).toBeTruthy();
      expect(findText(view.container, "Release Team Run")).toBeTruthy();

      await clickButton(view.container, "在对话中打开");

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "nuka:navigate",
          detail: expect.objectContaining({
            kind: "team_run",
            page: "chat",
            sessionId: "run-release",
          }),
        }),
      );
    } finally {
      dispatchEventSpy.mockRestore();
    }
  });

  it("renders policy and coordination editors as direct fields instead of raw json textareas", async () => {
    const view = await renderIntoDocument(<TeamPage />);
    cleanups.push(view.cleanup);

    expect(
      view.container.querySelector('textarea[aria-label="Prompt constraints"]'),
    ).toBeFalsy();
    expect(
      view.container.querySelector('textarea[aria-label="Permission policy"]'),
    ).toBeFalsy();
    expect(
      view.container.querySelector('input[aria-label="工作语言"]'),
    ).toBeTruthy();
    expect(
      view.container.querySelector('input[aria-label="工作规则 1"]'),
    ).toBeTruthy();
    expect(
      view.container.querySelector('input[aria-label="覆盖范围 1"]'),
    ).toBeTruthy();
    expect(
      view.container.querySelector('input[aria-label="允许访问的资源 1"]'),
    ).toBeTruthy();
    expect(
      view.container.querySelector('input[aria-label="禁止动作 1"]'),
    ).toBeTruthy();
    expect(
      view.container.querySelector(
        'input[aria-label="成功标准名称 1"]',
      ),
    ).toBeTruthy();
    expect(
      view.container.querySelector(
        'input[aria-label="成功标准内容 1"]',
      ),
    ).toBeTruthy();
    expect(
      view.container.querySelector('input[aria-label="流程"]'),
    ).toBeTruthy();
    expect(
      view.container.querySelector(
        'textarea[aria-label="反馈回路"]',
      ),
    ).toBeTruthy();
    expect(
      view.container.querySelector(
        'textarea[aria-label="异常处理"]',
      ),
    ).toBeTruthy();
    expect(
      view.container.querySelector('input[aria-label="角色层级名称 1"]'),
    ).toBeTruthy();
    expect(
      view.container.querySelector(
        'input[aria-label="角色层级内容 1"]',
      ),
    ).toBeTruthy();
    expect(findText(view.container, '"allowedResources"')).toBeFalsy();
    expect(findText(view.container, '"checklistComplete"')).toBeFalsy();
    expect(findText(view.container, '"flow"')).toBeFalsy();
  });

  it("keeps the page edit-only and saves structured team policy fields back into the persisted json shape", async () => {
    const view = await renderIntoDocument(<TeamPage />);
    cleanups.push(view.cleanup);
    const toastCapture = captureToasts();

    try {
      expect(
        findText(view.container, "Generate a Team from a goal"),
      ).toBeFalsy();
      expect(
        findText(view.container, "Generate a team from a goal to begin."),
      ).toBeFalsy();

      await setInputValue(
        view.container,
        "协作团队说明",
        "Tighten the release checklist before launch.",
      );
      await setInputValue(
        view.container,
        "工作规则 1",
        "Only cite evidence found in the workspace.",
      );
      await setInputValue(view.container, "工作语言", "zh-CN");
      await setInputValue(view.container, "调度智能体数量", "1");
      await setInputValue(view.container, "执行智能体最少数量", "2");
      await setInputValue(
        view.container,
        "允许访问的资源 1",
        "/verified-evidence",
      );
      await setInputValue(view.container, "禁止动作 1", "force_push_main");
      await setInputValue(
        view.container,
        "成功标准内容 1",
        "required",
      );
      await setInputValue(view.container, "流程", "sequential");
      await clickButton(view.container, "移除 Publisher");
      await clickButton(view.container, "加入 Reviewer");
      await clickButton(view.container, "保存模板");

      const updateCall = invokeMock.mock.calls.find(
        ([command]) => command === "update_team",
      );
      expect(updateCall).toBeTruthy();

      const updatedTeam = updateCall?.[1]?.team as typeof sampleTeam;
      expect(updatedTeam.summary).toBe(
        "Tighten the release checklist before launch.",
      );
      expect(JSON.parse(updatedTeam.promptConstraints)).toEqual(
        expect.objectContaining({
          language: "zh-CN",
          mustHaveRoles: {
            executorAgentsMin: 2,
            schedulerAgents: 1,
          },
          operationalRules: [
            "Only cite evidence found in the workspace.",
            "Cite release artifacts before conclusions.",
          ],
          scope: ["release", "notes"],
        }),
      );
      expect(JSON.parse(updatedTeam.permissionPolicy)).toEqual(
        expect.objectContaining({
          allowedResources: ["/verified-evidence", "/notes"],
          deniedActions: ["force_push_main"],
          maxExecutionTimeMinutes: 20,
        }),
      );
      expect(JSON.parse(updatedTeam.successCriteria)).toEqual(
        expect.objectContaining({
          notesReviewed: "required",
          checklistComplete: true,
        }),
      );
      expect(JSON.parse(updatedTeam.coordinationPolicy)).toEqual(
        expect.objectContaining({
          flow: "sequential",
        }),
      );
      expect(
        updatedTeam.agentAssignments.map((assignment) => assignment.agentId),
      ).toEqual(["agent-moderator", "agent-reviewer"]);
      expect(updatedTeam.agents.map((agent) => agent.name)).toEqual([
        "Moderator",
        "Reviewer",
      ]);
      expect(toastCapture.toasts).toContainEqual(
        expect.objectContaining({
          message: "协作团队模板已保存。",
          tone: "success",
        }),
      );
      expect(findText(view.container, "协作团队模板已保存。")).toBeFalsy();
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
      expect(findText(view.container, "可用工具")).toBeTruthy();
      expect(findText(view.container, "在对话中启动")).toBeTruthy();
      expect(
        findText(
          view.container,
          "Provider-backed teams stay persisted and can be resumed into new runs.",
        ),
      ).toBeFalsy();
      expect(
        findText(view.container, "Generate a Team from a goal"),
      ).toBeFalsy();
      expect(
        findText(view.container, "Generate a team from a goal to begin."),
      ).toBeFalsy();
      expect(
        Array.from(view.container.querySelectorAll("input")).find(
          (node) => node.getAttribute("aria-label") === "Team goal",
        ),
      ).toBeUndefined();

      await clickButton(view.container, "在对话中启动");

      expect(toastCapture.toasts).toContainEqual(
        expect.objectContaining({
          message: "已启动协作流程：Release Team Run",
          tone: "success",
        }),
      );
      expect(
        findText(view.container, "已启动协作流程：Release Team Run"),
      ).toBeFalsy();
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

    const listEmpty = view.container.querySelector(
      '[data-testid="team-list-empty"]',
    );
    const editorEmpty = view.container.querySelector(
      '[data-testid="team-editor-empty"]',
    );

    expect(listEmpty?.textContent?.trim()).toBe("还没有协作团队。");
    expect(listEmpty?.className).toContain("team-list__empty--centered");
    expect(editorEmpty?.className).toContain("team-editor__empty--centered");
    expect(findText(view.container, "先用一句话生成协作团队")).toBeTruthy();
    expect(findButton(view.container, "一句话生成协作团队")).toBeTruthy();
  });

  it("creates a team from a one-line goal when the workspace starts empty", async () => {
    const generatedTeam = {
      ...sampleTeam,
      id: "team-desktop-p0",
      name: "桌面 P0 验收协作团队",
      goal: "请创建一个桌面 P0 验收协作团队，至少包含 5 个子智能体，分别负责 UI 审核、team run、memory、文件时间线和恢复验证。",
      agents: [
        sampleTeam.agents[0],
        sampleTeam.agents[1],
        {
          ...sampleTeam.agents[1],
          id: "agent-memory",
          name: "Memory Reviewer",
          role: "Memory Reviewer",
          responsibility: "核对记忆图、记忆审核和 owner rail 语义。",
        },
        {
          ...sampleTeam.agents[1],
          id: "agent-files",
          name: "Files Reviewer",
          role: "Files Reviewer",
          responsibility: "核对文件时间线与 round/batch 展示。",
        },
        {
          ...sampleTeam.agents[1],
          id: "agent-recovery",
          name: "Recovery Reviewer",
          role: "Recovery Reviewer",
          responsibility: "核对重启恢复和 blocked/resume 语义。",
        },
      ],
      agentAssignments: [
        sampleTeam.agentAssignments[0],
        sampleTeam.agentAssignments[1],
        {
          ...sampleTeam.agentAssignments[1],
          id: "assignment-memory",
          agentId: "agent-memory",
          orderHint: 2,
        },
        {
          ...sampleTeam.agentAssignments[1],
          id: "assignment-files",
          agentId: "agent-files",
          orderHint: 3,
        },
        {
          ...sampleTeam.agentAssignments[1],
          id: "assignment-recovery",
          agentId: "agent-recovery",
          orderHint: 4,
        },
      ],
    };

    invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      switch (command) {
        case "list_teams":
          return [];
        case "list_agents":
          return availableAgents;
        case "list_workspace_sessions":
          return [];
        case "create_team_from_goal":
          return generatedTeam;
        default:
          throw new Error(`unexpected command: ${command}`);
      }
    });

    const toastCapture = captureToasts();

    try {
      const view = await renderIntoDocument(<TeamPage />);
      cleanups.push(view.cleanup);

      await setInputValue(
        view.container,
        "协作团队目标",
        generatedTeam.goal,
      );
      await clickButton(view.container, "一句话生成协作团队");

      expect(invokeMock).toHaveBeenCalledWith("create_team_from_goal", {
        goal: generatedTeam.goal,
      });
      expect(findText(view.container, "桌面 P0 验收协作团队")).toBeTruthy();
      expect(findText(view.container, "Memory Reviewer")).toBeTruthy();
      expect(toastCapture.toasts).toContainEqual(
        expect.objectContaining({
          message: "协作团队模板已生成，可继续微调字段。",
          tone: "success",
        }),
      );
    } finally {
      toastCapture.release();
    }
  });
});
