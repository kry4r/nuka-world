import App from "./App";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findText, renderIntoDocument } from "./test/render";

const invokeMock = vi.fn(async (command: string) => {
  switch (command) {
    case "list_memory_scopes":
      return [];
    case "get_memory_node_detail":
      return null;
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
  invoke: (command: string) => invokeMock(command),
}));

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

describe("App shell", () => {
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
});

