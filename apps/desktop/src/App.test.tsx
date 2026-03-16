import App from "./App";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findText, renderIntoDocument } from "./test/render";

const DESKTOP_LOCALE_STORAGE_KEY = "nuka.desktop.locale";

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
  const normalizedText = text.trim().toLowerCase();

  return Array.from(container.querySelectorAll("button")).find((button) => {
    const buttonText = button.textContent?.trim().toLowerCase() ?? "";
    const ariaLabel = button.getAttribute("aria-label")?.trim().toLowerCase() ?? "";
    const title = button.getAttribute("title")?.trim().toLowerCase() ?? "";

    return (
      buttonText === normalizedText ||
      buttonText.includes(normalizedText) ||
      ariaLabel === normalizedText ||
      ariaLabel.includes(normalizedText) ||
      title === normalizedText ||
      title.includes(normalizedText)
    );
  });
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

async function setSelectValue(container: HTMLElement, ariaLabel: string, value: string) {
  const select = container.querySelector(
    `select[aria-label="${ariaLabel}"]`,
  ) as HTMLSelectElement | null;

  await act(async () => {
    if (!select) {
      throw new Error(`select missing: ${ariaLabel}`);
    }

    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, "en-US");
});

afterEach(async () => {
  invokeMock.mockClear();
  appWindowControls.close.mockClear();
  appWindowControls.minimize.mockClear();
  appWindowControls.startDragging.mockClear();
  appWindowControls.toggleMaximize.mockClear();
  window.localStorage.clear();
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
  it("defaults the desktop shell to Chinese and persists locale changes from settings", async () => {
    window.localStorage.removeItem(DESKTOP_LOCALE_STORAGE_KEY);

    const firstView = await renderIntoDocument(<App />);
    cleanups.push(firstView.cleanup);

    expect(findText(firstView.container, "对话")).toBeTruthy();
    expect(findText(firstView.container, "设置")).toBeTruthy();
    expect(findText(firstView.container, "打开设置")).toBeTruthy();
    expect(findText(firstView.container, "Chat")).toBeFalsy();
    expect(findText(firstView.container, "Open Settings")).toBeFalsy();

    await clickButton(firstView.container, "设置");
    await clickButton(firstView.container, "外观");
    await setSelectValue(firstView.container, "界面语言", "en-US");

    expect(findText(firstView.container, "Chat")).toBeTruthy();
    expect(findText(firstView.container, "Settings")).toBeTruthy();
    expect(window.localStorage.getItem(DESKTOP_LOCALE_STORAGE_KEY)).toBe("en-US");

    await firstView.cleanup();

    const secondView = await renderIntoDocument(<App />);
    cleanups.push(secondView.cleanup);

    expect(findText(secondView.container, "Chat")).toBeTruthy();
    expect(findText(secondView.container, "Settings")).toBeTruthy();
    expect(findText(secondView.container, "对话")).toBeFalsy();
  });

  it("shows Team in navigation and no longer shows Workflow in the shell nav", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const chatButton = view.container.querySelector(
      'button[aria-label="Chat"]',
    ) as HTMLButtonElement | null;
    const teamButton = view.container.querySelector(
      'button[aria-label="Team"]',
    ) as HTMLButtonElement | null;

    expect(findText(view.container, "Team")).toBeTruthy();
    expect(view.container.querySelector('button[aria-label="Workflow"]')).toBeFalsy();
    expect(chatButton?.querySelector(".app-sidebar__nav-icon")).toBeTruthy();
    expect(chatButton?.querySelector(".app-sidebar__nav-label")?.textContent).toContain("Chat");
    expect(teamButton?.querySelector(".app-sidebar__nav-icon")).toBeTruthy();
    expect(teamButton?.querySelector(".app-sidebar__nav-label")?.textContent).toContain("Team");

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
    expect(findText(view.container, "Local Provider")).toBeTruthy();
    expect(findText(view.container, "Ready for chat and team runs.")).toBeFalsy();
    expect(providerCard?.querySelector(".status-badge")).toBeFalsy();
    expect(providerCard?.querySelector(".app-sidebar__provider-eyebrow")).toBeFalsy();
    expect(providerCard?.querySelector(".app-sidebar__provider-message")).toBeFalsy();
  });

  it("deduplicates runtime status requests across shell consumers on first load", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const runtimeStatusCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "app_runtime_status",
    );

    expect(runtimeStatusCalls).toHaveLength(1);
  });

  it("renders a global toast when the app receives a toast event", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("nuka:toast", {
          detail: {
            message: "Draft loaded from editor.",
            tone: "success",
          },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.container.querySelector('[data-testid="app-toast-viewport"]')).toBeTruthy();
    expect(findText(view.container, "Draft loaded from editor.")).toBeTruthy();
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

  it("keeps window chrome lightweight instead of rendering a global shell titlebar", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const titlebar = view.container.querySelector('[data-testid="app-titlebar"]');
    const windowControls = view.container.querySelector('[data-testid="app-window-controls"]');
    const minimizeButton = view.container.querySelector(
      'button[aria-label="Minimize window"]',
    ) as HTMLButtonElement | null;
    const maximizeButton = view.container.querySelector(
      'button[aria-label="Maximize window"]',
    ) as HTMLButtonElement | null;
    const closeButton = view.container.querySelector(
      'button[aria-label="Close window"]',
    ) as HTMLButtonElement | null;

    expect(titlebar).toBeFalsy();
    expect(windowControls).toBeTruthy();
    expect(findText(view.container, "Nuka World Desktop")).toBeFalsy();
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

    const dragRegion = view.container.querySelector(".app-window-drag-region");
    const sidebar = view.container.querySelector(".app-sidebar");
    const sidebarBrand = view.container.querySelector(".app-sidebar__brand");
    const providerCard = view.container.querySelector('[data-testid="sidebar-provider-card"]');

    expect(dragRegion?.className).toContain("app-window-drag-region");
    expect(dragRegion?.className).toContain("app-shell__chrome-lock");
    expect(sidebar?.className).toContain("app-shell__chrome-lock");
    expect(sidebarBrand?.className).toContain("app-shell__chrome-lock");
    expect(providerCard?.className).toContain("app-shell__chrome-lock");
  });

  it("keeps a drag layer separate from the lightweight window controls", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const windowChrome = view.container.querySelector('[data-testid="app-window-chrome"]');
    const dragRegion = view.container.querySelector(".app-window-drag-region");
    const controls = view.container.querySelector('[data-testid="app-window-controls"]');

    expect(windowChrome?.firstElementChild).toBe(dragRegion);
    expect(windowChrome?.lastElementChild).toBe(controls);
    expect(dragRegion?.hasAttribute("data-tauri-drag-region")).toBe(true);
  });

  it("starts native dragging from the drag region but not from window controls", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const dragRegion = view.container.querySelector(".app-window-drag-region");
    const closeButton = view.container.querySelector(
      'button[aria-label="Close window"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      dragRegion?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
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

  it("refreshes the sidebar provider card when runtime refresh is requested", async () => {
    runtimeStatusState.provider.kind = "missing";
    runtimeStatusState.provider.message = "Provider required";
    runtimeStatusState.provider.label = null;

    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.container.textContent).toContain("No provider configured");

    await act(async () => {
      runtimeStatusState.provider.kind = "ready";
      runtimeStatusState.provider.message = "Provider ready";
      runtimeStatusState.provider.label = "Daiju MiniMax";
      window.dispatchEvent(new CustomEvent("nuka:runtime-status-refresh"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.container.textContent).toContain("Daiju MiniMax");
    expect(view.container.textContent).not.toContain("No provider configured");
  });

  it("keeps chat as the default page before any team run starts", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    expect(view.container.querySelector('.app-shell__page[data-active-page="chat"]')).toBeTruthy();
    expect(view.container.querySelector('[aria-label="Chat landing hero"]')).toBeTruthy();
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

  it("creates a team from chat without auto-starting a run", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await clickButton(view.container, "+");
    await clickButton(view.container, "Create team");
    await setComposerValue(view.container, "Ship the release and publish notes");
    await clickButton(view.container, "Send");

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.container.querySelector('.app-shell__page[data-active-page="chat"]')).toBeTruthy();
    expect(findText(view.container, "Release Team Run")).toBeFalsy();
    expect(findText(view.container, "Workflow Lobby")).toBeFalsy();
    expect(findText(view.container, "Workflow Room")).toBeFalsy();
    expect(invokeMock).toHaveBeenCalledWith("create_team_from_goal", {
      goal: "Ship the release and publish notes",
    });
    expect(invokeMock).not.toHaveBeenCalledWith("start_team_run", expect.anything());
  });
});
