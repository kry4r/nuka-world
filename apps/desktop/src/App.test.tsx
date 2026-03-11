import App from "./App";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findText, renderIntoDocument } from "./test/render";

const runtimeStatusState = {
  provider: {
    kind: "ready",
    message: "Provider ready",
    label: "Local Provider" as string | null,
  },
  knowledge: {
    kind: "ready",
    message: "Knowledge ready",
  },
  app: {
    kind: "bootstrapped",
    message: "Bootstrapped",
  },
};

const sampleTeam = {
  id: "team-release",
  name: "Release Team",
  goal: "Ship the release and publish notes",
  summary: "Coordinates release validation, notes, and final publish readiness.",
  successCriteria: "Release notes and checklist are complete.",
  coordinationPolicy: "Moderator-led rounds with checkpoint summaries.",
  createdAt: "2026-03-11T12:00:00Z",
  updatedAt: "2026-03-11T12:00:00Z",
  status: "ready",
  agents: [],
};

const sampleRun = {
  id: "run-release",
  teamId: "team-release",
  title: "Release Team Run",
  goal: "Ship the release and publish notes",
  status: "active",
  currentPhase: "kickoff",
  leadAgentId: "agent-coordinator",
  charter: {
    goal: "Ship the release and publish notes",
    successCriteria: "Release notes and checklist are complete.",
    outputFormat: "Checkpoint summary",
    currentPhase: "kickoff",
    maxRounds: 6,
    maxActiveAgentsPerRound: 2,
    maxMessagesPerAgentPerRound: 2,
    budgetPolicy: "Summaries only",
    stopConditions: ["Checklist complete"],
  },
  createdAt: "2026-03-11T12:10:00Z",
  updatedAt: "2026-03-11T12:15:00Z",
  agents: [],
  events: [],
};

const workflowExplanations = {
  "workflow-research-brief": {
    workflowId: "workflow-research-brief",
    title: "Research Brief",
    summary: "Turn a rough goal into a clear brief with staged drafting and review.",
    steps: [
      {
        id: "scope",
        title: "Scope intake",
        purpose: "Capture the product goal and framing constraints.",
        executor: "Room coordinator",
        inputSource: "Chat goal",
        output: "Structured workflow brief",
        completion: "Goal and audience are clear",
      },
      {
        id: "draft",
        title: "Draft brief",
        purpose: "Draft the first research brief from the captured scope.",
        executor: "Draft lane",
        inputSource: "Structured workflow brief",
        output: "Research brief draft",
        completion: "Draft is ready for review",
      },
    ],
    dependencies: {
      agents: ["Room coordinator", "Draft lane"],
      toolsAndKnowledge: ["Project notes", "Knowledge search"],
      requiredInputs: ["Goal"],
    },
  },
  "workflow-release-notes": {
    workflowId: "workflow-release-notes",
    title: "Release Notes",
    summary: "Draft, review, and publish release notes with a cleaner publish handoff.",
    steps: [
      {
        id: "collect",
        title: "Collect changes",
        purpose: "Gather changes that belong in the release.",
        executor: "Release reviewer",
        inputSource: "Release scope",
        output: "Confirmed release change list",
        completion: "Candidate changes are validated",
      },
      {
        id: "publish",
        title: "Prepare publish draft",
        purpose: "Turn validated changes into a publish-ready note set.",
        executor: "Publishing lane",
        inputSource: "Confirmed release change list",
        output: "Release notes draft",
        completion: "Draft is ready for approval",
      },
    ],
    dependencies: {
      agents: ["Release reviewer", "Publishing lane"],
      toolsAndKnowledge: ["Knowledge search", "Release changelog"],
      requiredInputs: ["Release scope"],
    },
  },
  "workflow-customer-triage": {
    workflowId: "workflow-customer-triage",
    title: "Customer Triage",
    summary: "Classify and route customer issues with a compact triage loop.",
    steps: [
      {
        id: "triage",
        title: "Classify issue",
        purpose: "Determine severity and routing path.",
        executor: "Triage lane",
        inputSource: "Issue summary",
        output: "Severity and owner suggestion",
        completion: "Issue is categorized",
      },
    ],
    dependencies: {
      agents: ["Triage lane"],
      toolsAndKnowledge: ["Issue history"],
      requiredInputs: ["Issue summary"],
    },
  },
} as const;

const invokeMock = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  switch (command) {
    case "app_runtime_status":
      return {
        provider: { ...runtimeStatusState.provider },
        knowledge: { ...runtimeStatusState.knowledge },
        app: { ...runtimeStatusState.app },
      };
    case "route_world_prompt": {
      const prompt = String(args?.prompt ?? "");
      return {
        session: {
          id: "chat-session-default",
          title: prompt,
          providerId: "provider-local",
          workflowId: null,
          messageCount: 1,
        },
        route: {
          kind: "direct_reply",
        },
        messages: [
          {
            id: "chat-default-message-1",
            role: "user",
            content: prompt,
          },
        ],
        provider: {
          id: "provider-local",
          name: "Local",
          model: "gpt-oss",
          baseUrl: "http://localhost:11434/v1",
        },
        context: {
          attachedAgents: [],
          attachedKnowledgeLibraries: [],
        },
      };
    }
    case "list_teams":
      return [sampleTeam];
    case "create_team_from_goal":
      return {
        ...sampleTeam,
        goal: String(args?.goal ?? sampleTeam.goal),
      };
    case "start_team_run":
      return sampleRun;
    case "list_workspace_sessions":
      return [];
    case "load_workspace_session":
      return null;
    case "explain_workflow":
      return (
        workflowExplanations[String(args?.workflowId ?? "workflow-research-brief") as keyof typeof workflowExplanations] ??
        workflowExplanations["workflow-research-brief"]
      );
    case "revise_workflow":
      return {
        workflowId: String(args?.workflowId ?? "workflow-research-brief"),
        prompt: String(args?.prompt ?? ""),
        changeSummary: "Split drafting and publishing into clearer review stages.",
        stepChanges: [
          "Add a dedicated review step before publish.",
          "Search the knowledge base before drafting.",
        ],
        dependencyChanges: ["Add Knowledge search before draft generation."],
        outcomeChanges: ["Draft output is now optimized for a publish-ready changelog."],
      };
    case "start_workflow_session":
      return {
        sessionId: "workflow-session-1",
        workflowId: String(args?.workflowId ?? "workflow-release-notes"),
        inputs: (args?.inputs as Record<string, string> | undefined) ?? {},
        status: "active",
        origin:
          (args?.origin as
            | { sourceSessionId: string; sourceMode: "create_workflow" | "specific_workflow" }
            | undefined) ?? null,
        events: [
          {
            kind: "user_message",
            id: "workflow-user-1",
            content:
              ((args?.inputs as Record<string, string> | undefined)?.goal ??
                (args?.inputs as Record<string, string> | undefined)?.releaseScope ??
                (args?.inputs as Record<string, string> | undefined)?.issueSummary ??
                (args?.inputs as Record<string, string> | undefined)?.request ??
                "Prepare a workflow room"),
          },
          {
            kind: "assistant_message",
            id: "workflow-assistant-1",
            content: "I opened the workflow room from chat context.",
          },
          {
            kind: "node_event",
            id: "workflow-node-1",
            title: "Chat handoff",
            status: "completed",
            detail: "Workflow room seeded from the active World chat session.",
          },
        ],
      };
    case "list_memory_scopes":
      return [];
    case "get_memory_node_detail":
      return null;
    case "list_pending_memory_candidates":
      return [];
    case "review_memory_candidate":
      return undefined;
    case "list_knowledge_libraries":
      return [];
    case "list_index_jobs":
      return [];
    case "default_agent_tool_bindings":
      return { names: ["codex", "git", "search_knowledge"] };
    case "list_agents":
      return [];
    case "list_providers":
      return [];
    case "load_settings":
      return {
        defaultProviderId: "",
        fallbackProviderId: "",
        connectionChecks: true,
        interfaceFont: "Inter",
        messageFont: "Inter Text",
        textSize: "14 px",
        language: "English (US)",
        responseLocale: "Follow session",
        timeFormat: "24-hour",
        density: "Comfortable",
        motion: "Standard",
        windowChrome: "Minimal glass",
        sidebarDefault: "Expanded",
        closeBehavior: "Minimize to tray",
        launchAtLogin: false,
        trayResident: true,
        backgroundAdapters: true,
        logging: "Standard",
        notifications: true,
      };
    default:
      return null;
  }
});

const { appWindowControls } = vi.hoisted(() => ({
  appWindowControls: {
    close: vi.fn(async () => undefined),
    minimize: vi.fn(async () => undefined),
    startDragging: vi.fn(async () => undefined),
    toggleMaximize: vi.fn(async () => undefined),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: appWindowControls.close,
    minimize: appWindowControls.minimize,
    startDragging: appWindowControls.startDragging,
    toggleMaximize: appWindowControls.toggleMaximize,
  }),
}));

const cleanups: Array<() => Promise<void>> = [];

function getButtonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text || button.textContent?.includes(text),
  );
}

async function clickButton(container: HTMLElement, text: string) {
  await act(async () => {
    getButtonByText(container, text)?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function setComposerValue(container: HTMLElement, value: string) {
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;

  await act(async () => {
    if (!textarea) {
      throw new Error("textarea missing");
    }

    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
}

async function clickWorkflowOption(container: HTMLElement, workflowId: string) {
  const option = container.querySelector(
    `[data-workflow-id="${workflowId}"]`,
  ) as HTMLButtonElement | null;

  await act(async () => {
    if (!option) {
      throw new Error("workflow option missing");
    }

    option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

afterEach(async () => {
  invokeMock.mockClear();
  appWindowControls.close.mockClear();
  appWindowControls.minimize.mockClear();
  appWindowControls.startDragging.mockClear();
  appWindowControls.toggleMaximize.mockClear();
  runtimeStatusState.provider.kind = "ready";
  runtimeStatusState.provider.message = "Provider ready";
  runtimeStatusState.provider.label = "Local Provider";

  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

describe("App shell", () => {
  it("shows Team in navigation and no longer shows Workflow in the shell nav", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Team")).toBeTruthy();
    expect(view.container.querySelector('button[aria-label="Workflow"]')).toBeFalsy();

    await clickButton(view.container, "+");

    expect(findText(view.container, "Choose workflow")).toBeFalsy();
    expect(findText(view.container, "Create workflow")).toBeFalsy();
  });

  it("shows the current provider card above settings when a default provider is configured", async () => {
    runtimeStatusState.provider.kind = "ready";
    runtimeStatusState.provider.message = "Default provider configured";
    runtimeStatusState.provider.label = "Local Provider";

    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const providerCard = view.container.querySelector('[data-testid="sidebar-provider-card"]');
    const settingsButton = view.container.querySelector(
      'button[aria-label="Settings"]',
    ) as HTMLButtonElement | null;

    expect(providerCard).toBeTruthy();
    expect(providerCard?.nextElementSibling).toBe(settingsButton);
    expect(findText(view.container, "Provider")).toBeTruthy();
    expect(findText(view.container, "Local Provider")).toBeTruthy();
    expect(findText(view.container, "Ready for chat and team runs.")).toBeTruthy();
    expect(providerCard?.querySelector(".status-badge")).toBeFalsy();
  });

  it("shows a missing-provider card above settings and opens settings from the card action", async () => {
    runtimeStatusState.provider.kind = "missing";
    runtimeStatusState.provider.message = "Provider required";
    runtimeStatusState.provider.label = null;

    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const providerCard = view.container.querySelector('[data-testid="sidebar-provider-card"]');

    expect(providerCard).toBeTruthy();
    expect(findText(view.container, "No provider configured")).toBeTruthy();
    expect(
      findText(view.container, "Open settings to add a default OpenAI-compatible provider."),
    ).toBeFalsy();
    expect(findText(view.container, "Provider required")).toBeFalsy();
    expect(findText(view.container, "Required")).toBeFalsy();
    expect(providerCard?.querySelector(".status-badge")).toBeFalsy();

    await act(async () => {
      getButtonByText(view.container, "Open Settings")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.container.querySelector('.app-shell__page[data-active-page="settings"]')).toBeTruthy();
  });

  it("renders the sidebar logo as a static brand mark without button semantics", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const brand = view.container.querySelector(".app-sidebar__brand");

    expect(brand?.tagName).toBe("DIV");
    expect(view.container.querySelector('button[aria-label="Open Chat"]')).toBeFalsy();
  });

  it("renders a custom title bar and wires window controls", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const titlebar = view.container.querySelector('[data-testid="app-titlebar"]');
    const minimizeButton = view.container.querySelector(
      'button[aria-label="Minimize window"]',
    ) as HTMLButtonElement | null;
    const maximizeButton = view.container.querySelector(
      'button[aria-label="Maximize window"]',
    ) as HTMLButtonElement | null;
    const closeButton = view.container.querySelector(
      'button[aria-label="Close window"]',
    ) as HTMLButtonElement | null;

    expect(titlebar).toBeTruthy();
    expect(minimizeButton).toBeTruthy();
    expect(maximizeButton).toBeTruthy();
    expect(closeButton).toBeTruthy();

    await act(async () => {
      minimizeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      maximizeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(appWindowControls.minimize).toHaveBeenCalledTimes(1);
    expect(appWindowControls.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(appWindowControls.close).toHaveBeenCalledTimes(1);
  });

  it("marks the drag region and shell chrome as non-selectable", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const dragRegion = view.container.querySelector(".app-titlebar__drag");
    const sidebar = view.container.querySelector(".app-sidebar");
    const sidebarBrand = view.container.querySelector(".app-sidebar__brand");
    const providerCard = view.container.querySelector('[data-testid="sidebar-provider-card"]');

    expect(dragRegion?.className).toContain("app-titlebar__drag--overlay");
    expect(dragRegion?.className).toContain("app-shell__chrome-lock");
    expect(sidebar?.className).toContain("app-shell__chrome-lock");
    expect(sidebarBrand?.className).toContain("app-shell__chrome-lock");
    expect(providerCard?.className).toContain("app-shell__chrome-lock");
  });

  it("keeps a full-row drag layer behind the titlebar chrome", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const titlebar = view.container.querySelector('[data-testid="app-titlebar"]');
    const dragRegion = view.container.querySelector(".app-titlebar__drag");

    expect(titlebar?.firstElementChild).toBe(dragRegion);
    expect(dragRegion?.hasAttribute("data-tauri-drag-region")).toBe(true);
  });

  it("starts native dragging from the titlebar chrome but not from window controls", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const titlebar = view.container.querySelector('[data-testid="app-titlebar"]');
    const closeButton = view.container.querySelector(
      'button[aria-label="Close window"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      titlebar?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      await Promise.resolve();
    });

    expect(appWindowControls.startDragging).toHaveBeenCalledTimes(1);

    await act(async () => {
      closeButton?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      await Promise.resolve();
    });

    expect(appWindowControls.startDragging).toHaveBeenCalledTimes(1);
  });

  it("keeps the custom window controls outside the drag region", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const minimizeButton = view.container.querySelector(
      'button[aria-label="Minimize window"]',
    ) as HTMLButtonElement | null;
    const maximizeButton = view.container.querySelector(
      'button[aria-label="Maximize window"]',
    ) as HTMLButtonElement | null;
    const closeButton = view.container.querySelector(
      'button[aria-label="Close window"]',
    ) as HTMLButtonElement | null;

    expect(minimizeButton?.closest('[data-tauri-drag-region]')).toBeFalsy();
    expect(maximizeButton?.closest('[data-tauri-drag-region]')).toBeFalsy();
    expect(closeButton?.closest('[data-tauri-drag-region]')).toBeFalsy();
  });

  it("shows provider-required state for AI pages before a default provider exists", async () => {
    runtimeStatusState.provider.kind = "missing";
    runtimeStatusState.provider.message = "Provider required";

    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.container.textContent).toContain("No provider configured");
  });

  it("keeps chat as the default page before any team run starts", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    expect(view.container.querySelector('.app-shell__page[data-active-page="chat"]')).toBeTruthy();
    expect(view.container.querySelector('[aria-label="World chat landing hero"]')).toBeTruthy();
    expect(findText(view.container, "Direct chat")).toBeFalsy();
    expect(findText(view.container, "Release Team Run")).toBeFalsy();
  });

  it("does not render the removed top status strip and still tracks active navigation", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const statusStrip = view.container.querySelector('[data-testid="status-strip"]');
    const settingsButton = view.container.querySelector('button[aria-label="Settings"]');

    expect(statusStrip).toBeFalsy();

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(settingsButton?.getAttribute("aria-current")).toBe("page");
    expect(view.container.querySelector('.app-shell__page[data-active-page="settings"]')).toBeTruthy();
  });

  it("does not render the removed shell inspector on any page", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const settingsButton = view.container.querySelector('button[aria-label="Settings"]');
    const shellInspector = () => view.container.querySelector(".app-shell__inspector");

    expect(shellInspector()).toBeFalsy();

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(shellInspector()).toBeFalsy();
  });

  it("creates a team from chat and stays on the chat execution surface", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "+");
    await clickButton(view.container, "Create team");
    await setComposerValue(view.container, "Ship the release and publish notes");
    await clickButton(view.container, "Send");

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.container.querySelector('.app-shell__page[data-active-page="chat"]')).toBeTruthy();
    expect(findText(view.container, "Release Team Run")).toBeTruthy();
    expect(findText(view.container, "Workflow Lobby")).toBeFalsy();
    expect(findText(view.container, "Workflow Room")).toBeFalsy();
    expect(invokeMock).toHaveBeenCalledWith("create_team_from_goal", {
      goal: "Ship the release and publish notes",
    });
    expect(invokeMock).toHaveBeenCalledWith("start_team_run", {
      teamId: "team-release",
    });
  });
});
