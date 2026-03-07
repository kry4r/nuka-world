import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";
import { findText, renderIntoDocument } from "@/test/render";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({ count: 3, names: ["OpenAI", "Anthropic", "Ollama"] })),
}));

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  window.localStorage.clear();

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

function setFormValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setCheckboxValue(element: HTMLInputElement, checked: boolean) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
  setter?.call(element, checked);
  element.dispatchEvent(new Event("click", { bubbles: true }));
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("SettingsPage", () => {
  it("renders the settings hub with editable appearance fields", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Application Settings")).toBeTruthy();
    expect(findText(view.container, "Section Guide")).toBeTruthy();
    expect(findText(view.container, "+ Add Provider")).toBeTruthy();
    expect(findText(view.container, "Language")).toBeTruthy();

    const languageSelect = view.container.querySelector('select[aria-label="Language"]') as HTMLSelectElement | null;
    const saveButton = findButton(view.container, "Save Appearance");

    expect(languageSelect?.value).toBe("English (US)");
    expect(saveButton?.hasAttribute("disabled")).toBe(true);

    await act(async () => {
      if (!languageSelect) {
        throw new Error("Language select missing");
      }
      setFormValue(languageSelect, "简体中文");
    });

    expect(languageSelect?.value).toBe("简体中文");
    expect(saveButton?.hasAttribute("disabled")).toBe(false);

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(window.localStorage.getItem("nuka.settings.appearance")).toContain("简体中文");
  });

  it("adds a provider draft and saves provider settings", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    const providersButton = findButton(view.container, "Providers");
    expect(providersButton).toBeTruthy();

    await act(async () => {
      providersButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const addProviderButton = findButton(view.container, "+ Add Provider");
    expect(addProviderButton).toBeTruthy();

    await act(async () => {
      addProviderButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(findText(view.container, "4 configured")).toBeTruthy();

    const providerNameInputs = Array.from(
      view.container.querySelectorAll('input[aria-label="Provider name"]'),
    ) as HTMLInputElement[];
    const newestProvider = providerNameInputs[providerNameInputs.length - 1] ?? null;

    await act(async () => {
      if (!newestProvider) {
        throw new Error("Provider name input missing");
      }
      setFormValue(newestProvider, "OpenRouter");
    });

    const saveProviders = findButton(view.container, "Save Provider Changes");
    expect(saveProviders?.hasAttribute("disabled")).toBe(false);

    await act(async () => {
      saveProviders?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(window.localStorage.getItem("nuka.settings.providers")).toContain("OpenRouter");
  });

  it("switches the expanded section and persists runtime toggles", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    const runtimeButton = findButton(view.container, "Runtime");
    expect(runtimeButton).toBeTruthy();

    await act(async () => {
      runtimeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(findText(view.container, "Close behavior")).toBeTruthy();
    expect(
      findText(
        view.container,
        "Runtime keeps the desktop shell responsive while longer-lived tasks continue safely.",
      ),
    ).toBeTruthy();

    const launchToggle = view.container.querySelector('input[aria-label="Launch at login"]') as HTMLInputElement | null;
    const saveRuntime = findButton(view.container, "Save Runtime");

    expect(launchToggle?.checked).toBe(false);

    await act(async () => {
      if (!launchToggle) {
        throw new Error("Launch toggle missing");
      }
      setCheckboxValue(launchToggle, true);
    });

    expect(saveRuntime?.hasAttribute("disabled")).toBe(false);

    await act(async () => {
      saveRuntime?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(window.localStorage.getItem("nuka.settings.runtime")).toContain('"launchAtLogin":true');
  });
});


