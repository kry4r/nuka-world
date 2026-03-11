import App from "./App";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findText, renderIntoDocument } from "./test/render";

const runtimeStatusState = {
  provider: {
    kind: "ready",
    message: "Provider ready",
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
      const mode = args?.mode as { kind: string; workflowId?: string } | undefined;

      if (mode?.kind === "create_workflow") {
        return {
          session: {
            id: "chat-session-create",
            title: prompt,
            providerId: null,
            workflowId: null,
            messageCount: 1,
          },
          route: {
            kind: "new_workflow",
          },
          messages: [
            {
              id: "chat-create-message-1",
              role: "user",
              content: prompt,
            },
          ],
          provider: null,
          context: {
            attachedAgents: [],
            attachedKnowledgeLibraries: [],
          },
        };
      }

      if (mode?.kind === "specific_workflow") {
        return {
          session: {
            id: "chat-session-specific",
            title: prompt,
            providerId: null,
            workflowId: mode.workflowId ?? null,
            messageCount: 1,
          },
          route: {
            kind: "existing_workflow",
            workflowId: mode.workflowId ?? "workflow-release-notes",
          },
          messages: [
            {
              id: "chat-specific-message-1",
              role: "user",
              content: prompt,
            },
          ],
          provider: null,
          context: {
            attachedAgents: [],
            attachedKnowledgeLibraries: [],
          },
        };
      }

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
  appWindowControls.toggleMaximize.mockClear();
  runtimeStatusState.provider.kind = "ready";
  runtimeStatusState.provider.message = "Provider ready";

  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

describe("App shell", () => {
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

    expect(view.container.textContent).toContain("Provider required");
  });

  it("keeps chat as the default page before any workflow handoff", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    expect(view.container.querySelector('.app-shell__page[data-active-page="chat"]')).toBeTruthy();
    expect(view.container.querySelector('[aria-label="World chat landing hero"]')).toBeTruthy();
    expect(findText(view.container, "Direct chat")).toBeFalsy();
    expect(findText(view.container, "Workflow Room")).toBeFalsy();
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

  it("surfaces a create workflow handoff from chat and opens the workflow page on demand", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "+");
    await clickButton(view.container, "Create workflow");
    await setComposerValue(view.container, "Draft a release process");
    await clickButton(view.container, "Send");

    expect(findText(view.container, "Open Workflow")).toBeTruthy();
    expect(findText(view.container, "Draft a release process")).toBeTruthy();

    await clickButton(view.container, "Open Workflow");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.container.querySelector('.app-shell__page[data-active-page="workflow"]')).toBeTruthy();
    expect(findText(view.container, "Workflow Lobby")).toBeFalsy();
    expect(findText(view.container, "Workflow Room")).toBeFalsy();
    expect(findText(view.container, "Overview")).toBeTruthy();
    expect(findText(view.container, "Drafted from chat")).toBeTruthy();
    expect(findText(view.container, "Draft a release process")).toBeTruthy();
    expect(invokeMock).toHaveBeenCalledWith("explain_workflow", {
      workflowId: "workflow-research-brief",
    });

    const revisionInput = view.container.querySelector(
      'textarea[placeholder="Describe how to improve this workflow..."]',
    ) as HTMLTextAreaElement | null;
    expect(revisionInput?.value).toBe("Draft a release process");

    expect(
      invokeMock.mock.calls.filter(([command]) => command === "start_workflow_session"),
    ).toHaveLength(0);
    expect(
      invokeMock.mock.calls.filter(([command]) => command === "revise_workflow"),
    ).toHaveLength(0);
  });

  it("keeps a selected workflow handoff in chat until the workflow token explicitly opens details", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "+");
    await clickButton(view.container, "Choose workflow");
    await clickWorkflowOption(view.container, "workflow-release-notes");
    await setComposerValue(view.container, "Review the release checklist");
    await clickButton(view.container, "Send");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      invokeMock.mock.calls.filter(([command]) => command === "start_workflow_session"),
    ).toHaveLength(0);
    expect(view.container.querySelector('.app-shell__page[data-active-page="chat"]')).toBeTruthy();
    expect(findText(view.container, "Workflow Room")).toBeFalsy();

    const workflowToken = view.container.querySelector(
      '[data-testid="chat-workflow-token"]',
    ) as HTMLElement | null;
    expect(workflowToken?.textContent).toContain("Release Notes");
    expect(workflowToken?.textContent).toContain("Open Workflow");

    await clickButton(view.container, "Open Workflow");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.container.querySelector('.app-shell__page[data-active-page="workflow"]')).toBeTruthy();
    expect(findText(view.container, "Workflow Room")).toBeFalsy();
    expect(findText(view.container, "Workflow Lobby")).toBeFalsy();
    expect(findText(view.container, "Generated from chat")).toBeTruthy();
    expect(findText(view.container, "Review the release checklist")).toBeTruthy();
    expect(findText(view.container, "Prepare publish draft")).toBeTruthy();
    expect(invokeMock).toHaveBeenCalledWith("explain_workflow", {
      workflowId: "workflow-release-notes",
    });
    expect(
      invokeMock.mock.calls.filter(([command]) => command === "start_workflow_session"),
    ).toHaveLength(0);
  });
});
