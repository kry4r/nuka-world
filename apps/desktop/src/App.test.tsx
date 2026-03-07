import App from "./App";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findText, renderIntoDocument } from "./test/render";

const invokeMock = vi.fn(async (command: string) => {
  switch (command) {
    case "memory_promotion_policy":
      return { canPromote: true };
    case "default_knowledge_library":
      return { id: "library-user", name: "Personal Library" };
    case "provider_registry":
      return { count: 0, names: [] };
    case "integrated_tool_output_policy":
      return { toolName: "codex", targetScope: "SessionArtifacts" };
    case "default_agent_tool_bindings":
      return { names: ["codex", "git", "search_knowledge"] };
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
  it("renders primary navigation and bottom settings entry", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Chat")).toBeTruthy();
    expect(findText(view.container, "Workflow")).toBeTruthy();
    expect(findText(view.container, "Agents")).toBeTruthy();
    expect(findText(view.container, "Memory")).toBeTruthy();
    expect(findText(view.container, "Knowledge")).toBeTruthy();
    expect(findText(view.container, "Settings")).toBeTruthy();
  });

  it("navigates to settings from the footer entry", async () => {
    const view = await renderIntoDocument(<App />);
    cleanups.push(view.cleanup);

    const settingsButton = view.container.querySelector('button[aria-label="Settings"]');

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(findText(view.container, "Application Settings")).toBeTruthy();
    expect(findText(view.container, "Providers")).toBeTruthy();
  });
});
