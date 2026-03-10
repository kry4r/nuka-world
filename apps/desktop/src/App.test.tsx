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

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
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

async function setSelectValue(container: HTMLElement, value: string) {
  const select = container.querySelector("select") as HTMLSelectElement | null;

  await act(async () => {
    if (!select) {
      throw new Error("select missing");
    }

    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}

afterEach(async () => {
  invokeMock.mockClear();
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

  it("renders a persistent left rail with the Nuka SVG lockup", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const sidebar = view.container.querySelector('.app-sidebar[aria-label="Primary"]');
    const brandLockup = view.container.querySelector(".app-sidebar__brand .nuka-lockup");

    expect(sidebar).toBeTruthy();
    expect(brandLockup?.getAttribute("data-brand-source")).toBe("nuka-svg");
    expect(findText(view.container, "Settings")).toBeTruthy();
  });

  it("renders a top status strip that tracks the active page", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const statusStrip = view.container.querySelector('[data-testid="status-strip"]');
    const settingsButton = view.container.querySelector('button[aria-label="Settings"]');

    expect(statusStrip?.textContent).toContain("Chat");

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(settingsButton?.getAttribute("aria-current")).toBe("page");
    expect(statusStrip?.textContent).toContain("Settings");
    expect(view.container.querySelector('.app-shell__page[data-active-page="settings"]')).toBeTruthy();
  });

  it("opens the inspector only when the current page has contextual details", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const settingsButton = view.container.querySelector('button[aria-label="Settings"]');
    const shellInspector = () => view.container.querySelector(".app-shell__inspector");

    expect(shellInspector()?.getAttribute("data-inspector-state")).toBe("closed");

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(shellInspector()?.getAttribute("data-inspector-state")).toBe("open");
    expect(
      shellInspector()
        ?.textContent?.includes("Workspace Guide"),
    ).toBe(true);
  });

  it("surfaces a create workflow handoff from chat and opens the workflow page on demand", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "Create workflow");
    await setComposerValue(view.container, "Draft a release process");
    await clickButton(view.container, "Send");

    expect(findText(view.container, "Open Workflow")).toBeTruthy();
    expect(findText(view.container, "Draft a release process")).toBeTruthy();

    await clickButton(view.container, "Open Workflow");

    expect(view.container.querySelector('.app-shell__page[data-active-page="workflow"]')).toBeTruthy();
    expect(findText(view.container, "Workflow Lobby")).toBeTruthy();
    expect(view.container.textContent).toContain("Came from World chat session");

    const goalInput = view.container.querySelector(
      'input[placeholder="What should this workflow produce?"]',
    ) as HTMLInputElement | null;
    expect(goalInput?.value).toBe("Draft a release process");

    await clickButton(view.container, "Start Workflow");

    expect(invokeMock).toHaveBeenCalledWith(
      "start_workflow_session",
      expect.objectContaining({
        workflowId: "workflow-research-brief",
        inputs: { goal: "Draft a release process" },
        origin: {
          sourceSessionId: "chat-session-create",
          sourceMode: "create_workflow",
        },
      }),
    );
  });

  it("moves specific workflow mode into a workflow room after the first send and keeps context synchronized", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "Specific workflow");
    await setSelectValue(view.container, "workflow-release-notes");
    await setComposerValue(view.container, "Review the release checklist");
    await clickButton(view.container, "Send");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "start_workflow_session",
      expect.objectContaining({
        workflowId: "workflow-release-notes",
        inputs: { releaseScope: "Review the release checklist" },
        origin: {
          sourceSessionId: "chat-session-specific",
          sourceMode: "specific_workflow",
        },
      }),
    );
    expect(view.container.querySelector('.app-shell__page[data-active-page="workflow"]')).toBeTruthy();
    expect(findText(view.container, "Workflow Room")).toBeTruthy();
    expect(findText(view.container, "Review the release checklist")).toBeTruthy();
    expect(view.container.textContent).toContain("Came from World chat session");
    expect(findText(view.container, "Status: active")).toBeTruthy();
  });
});
