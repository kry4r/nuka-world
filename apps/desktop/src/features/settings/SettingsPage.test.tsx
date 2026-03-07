import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";
import { findText, renderIntoDocument } from "@/test/render";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({ count: 3, names: ["OpenAI", "Anthropic", "Ollama"] })),
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

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(text),
  );
}

describe("SettingsPage", () => {
  it("renders the settings hub with richer appearance controls", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Application Settings")).toBeTruthy();
    expect(findText(view.container, "Section Guide")).toBeTruthy();
    expect(findText(view.container, "Providers")).toBeTruthy();
    expect(findText(view.container, "+ Add Provider")).toBeTruthy();
    expect(findText(view.container, "Appearance")).toBeTruthy();
    expect(findText(view.container, "Runtime")).toBeTruthy();
    expect(findText(view.container, "Language")).toBeTruthy();
    expect(findText(view.container, "Message font")).toBeTruthy();
    expect(findText(view.container, "Text size")).toBeTruthy();
    expect(findText(view.container, "Current Section")).toBeFalsy();
  });

  it("switches the expanded section and updates the guide", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Language")).toBeTruthy();
    expect(
      findText(
        view.container,
        "Appearance shapes reading comfort, localization, and the overall desktop tone.",
      ),
    ).toBeTruthy();

    const runtimeButton = findButton(view.container, "Runtime");
    expect(runtimeButton).toBeTruthy();

    await act(async () => {
      runtimeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(findText(view.container, "Language")).toBeFalsy();
    expect(findText(view.container, "Close behavior")).toBeTruthy();
    expect(
      findText(
        view.container,
        "Runtime keeps the desktop shell responsive while longer-lived tasks continue safely.",
      ),
    ).toBeTruthy();
  });
});
