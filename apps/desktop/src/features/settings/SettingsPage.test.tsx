import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";
import { findText, renderIntoDocument } from "@/test/render";

const { defaultInvokeImplementation, invokeMock } = vi.hoisted(() => ({
  defaultInvokeImplementation: async (
    command: string,
    args?: Record<string, unknown>,
  ) => {
    switch (command) {
      case "list_providers":
        return [
          {
            id: "provider-local",
            name: "Local",
            baseUrl: "http://localhost:11434/v1",
            model: "gpt-oss",
            apiKey: "",
            hasSecret: true,
            secretUpdatedAt: "2026-03-12T00:00:00Z",
            local: true,
            enabled: true,
          },
        ];
      case "load_settings":
        return {
          defaultProviderId: "provider-local",
          fallbackProviderId: "provider-local",
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
      case "save_settings":
        return args?.payload ?? null;
      case "save_provider":
        return args?.provider ?? null;
      case "import_provider_from_env":
        return {
          id: "provider-env-local",
          name: "Env Local",
          baseUrl: "http://localhost:11434/v1",
          model: "gpt-oss",
          apiKey: "",
          hasSecret: true,
          secretUpdatedAt: "2026-03-12T00:00:00Z",
          local: true,
          enabled: true,
        };
      case "clear_provider_secret":
        return {
          id: "provider-local",
          name: "Local",
          baseUrl: "http://localhost:11434/v1",
          model: "gpt-oss",
          apiKey: "",
          hasSecret: false,
          secretUpdatedAt: null,
          local: true,
          enabled: true,
        };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  },
  invokeMock: vi.fn(async (command: string, args?: Record<string, unknown>) =>
    defaultInvokeImplementation(command, args),
  ),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  invokeMock.mockClear();
  invokeMock.mockImplementation(defaultInvokeImplementation);

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
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
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
  it("renders only provider and runtime operations sections", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    expect(view.container.querySelector('[data-testid="settings-section-nav"]')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="settings-control-surface"]')).toBeTruthy();
    expect(findText(view.container, "Providers")).toBeTruthy();
    expect(findText(view.container, "Runtime")).toBeTruthy();
    expect(findText(view.container, "General")).toBeFalsy();
    expect(findText(view.container, "Appearance")).toBeFalsy();
    expect(findText(view.container, "Shortcuts")).toBeFalsy();
    expect(view.container.textContent).not.toContain("configured");
    expect(view.container.textContent).not.toContain("Application Settings");
    expect(findText(view.container, "Default Provider")).toBeTruthy();
    expect(findText(view.container, "Fallback Provider")).toBeTruthy();
    expect(findText(view.container, "Connection checks")).toBeTruthy();
    expect(findText(view.container, "Language")).toBeFalsy();
    expect(findText(view.container, "Interface Font")).toBeFalsy();
  });

  it("removes decorative helper copy across the settings surface", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Language, locale, and reading density.")).toBeFalsy();
    expect(findText(view.container, "Keep language, locale, and density in one compact place.")).toBeFalsy();

    const providersButton = findButton(view.container, "Providers");
    expect(providersButton).toBeTruthy();

    await act(async () => {
      providersButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(findText(view.container, "Default routing and saved model endpoints.")).toBeFalsy();
    expect(findText(view.container, "Set default routing and keep saved runtimes compact.")).toBeFalsy();
    expect(findText(view.container, "Run lightweight provider checks before new work starts.")).toBeFalsy();
    expect(findText(view.container, "Provider checks run before new work starts.")).toBeFalsy();
    expect(findText(view.container, "Disabled providers stay saved but are skipped for new work.")).toBeFalsy();

    const runtimeButton = findButton(view.container, "Runtime");
    expect(runtimeButton).toBeTruthy();

    await act(async () => {
      runtimeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(findText(view.container, "Window lifecycle and background behavior.")).toBeFalsy();
    expect(
      findText(
        view.container,
        "Shape how the desktop app closes, stays resident, and surfaces notifications.",
      ),
    ).toBeFalsy();
    expect(
      findText(view.container, "Restore the desktop shell when the operating system starts."),
    ).toBeFalsy();
    expect(
      findText(
        view.container,
        "Keep the app available from the system tray after the main window closes.",
      ),
    ).toBeFalsy();
  });

  it("renders provider status truthfully in the redesigned provider surface", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    const providersButton = findButton(view.container, "Providers");
    expect(providersButton).toBeTruthy();

    await act(async () => {
      providersButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(findText(view.container, "Local runtime")).toBeTruthy();
    expect(findText(view.container, "Enabled")).toBeTruthy();
    expect(view.container.querySelector('[data-testid="provider-status-badge"]')).toBeTruthy();
  });

  it("shows secret presence without echoing saved api keys", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    const providersButton = findButton(view.container, "Providers");
    expect(providersButton).toBeTruthy();

    await act(async () => {
      providersButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const apiKeyInput = view.container.querySelector(
      'input[aria-label="Provider API Key"]',
    ) as HTMLInputElement | null;

    expect(apiKeyInput?.value).toBe("");
    expect(findText(view.container, "Secret saved")).toBeTruthy();
    expect(findText(view.container, "Replace secret")).toBeTruthy();
  });

  it("clears a saved provider secret explicitly", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    const providersButton = findButton(view.container, "Providers");
    expect(providersButton).toBeTruthy();

    await act(async () => {
      providersButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const clearSecretButton = findButton(view.container, "Clear secret");
    expect(clearSecretButton).toBeTruthy();

    await act(async () => {
      clearSecretButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "clear_provider_secret",
      expect.objectContaining({ providerId: "provider-local" }),
    );
    expect(findText(view.container, "No secret saved")).toBeTruthy();
  });

  it("keeps the selected default provider selected in settings", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    const providersButton = findButton(view.container, "Providers");
    expect(providersButton).toBeTruthy();

    await act(async () => {
      providersButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const defaultProviderSelect = view.container.querySelector(
      'select[aria-label="Default Provider"]',
    ) as HTMLSelectElement | null;

    expect(defaultProviderSelect?.value).toBe("provider-local");
    expect(findText(view.container, "Set default routing and keep saved runtimes compact.")).toBeFalsy();
  });

  it("saves the connection-check setting without helper copy", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    const providersButton = findButton(view.container, "Providers");
    expect(providersButton).toBeTruthy();

    await act(async () => {
      providersButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const connectionChecksToggle = view.container.querySelector(
      'input[aria-label="Connection checks"]',
    ) as HTMLInputElement | null;
    const saveProviders = findButton(view.container, "Save Provider Changes");

    expect(connectionChecksToggle?.checked).toBe(true);
    expect(findText(view.container, "Provider checks run before new work starts.")).toBeFalsy();

    await act(async () => {
      if (!connectionChecksToggle) {
        throw new Error("Connection checks toggle missing");
      }

      setCheckboxValue(connectionChecksToggle, false);
    });

    expect(findText(view.container, "Provider checks run before new work starts.")).toBeFalsy();
    expect(saveProviders?.hasAttribute("disabled")).toBe(false);

    await act(async () => {
      saveProviders?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "save_settings",
      expect.objectContaining({
        payload: expect.objectContaining({ connectionChecks: false }),
      }),
    );
  });

  it("adds a provider draft and saves it through tauri", async () => {
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

    const providerNameInputs = Array.from(
      view.container.querySelectorAll('input[aria-label="Provider name"]'),
    ) as HTMLInputElement[];

    expect(providerNameInputs).toHaveLength(2);

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

    expect(invokeMock).toHaveBeenCalledWith(
      "save_provider",
      expect.objectContaining({
        provider: expect.objectContaining({ name: "OpenRouter" }),
      }),
    );
  });

  it("imports a provider from env without silently overwriting existing providers", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    const providersButton = findButton(view.container, "Providers");
    expect(providersButton).toBeTruthy();

    await act(async () => {
      providersButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const importButton = findButton(view.container, "Import From Env");
    expect(importButton).toBeTruthy();

    await act(async () => {
      importButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(findText(view.container, "Env Local")).toBeTruthy();
    expect(
      Array.from(view.container.querySelectorAll('input[aria-label="Provider name"]')),
    ).toHaveLength(2);
  });

  it("enables provider save when only the fallback selection changes", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    const providersButton = findButton(view.container, "Providers");
    expect(providersButton).toBeTruthy();

    await act(async () => {
      providersButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const fallbackSelect = view.container.querySelector(
      'select[aria-label="Fallback Provider"]',
    ) as HTMLSelectElement | null;
    const saveProviders = findButton(view.container, "Save Provider Changes");

    expect(fallbackSelect?.value).toBe("provider-local");
    expect(saveProviders?.hasAttribute("disabled")).toBe(true);

    await act(async () => {
      if (!fallbackSelect) {
        throw new Error("Fallback provider select missing");
      }
      setFormValue(fallbackSelect, "");
    });

    expect(saveProviders?.hasAttribute("disabled")).toBe(false);

    await act(async () => {
      saveProviders?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "save_settings",
      expect.objectContaining({
        payload: expect.objectContaining({ fallbackProviderId: "" }),
      }),
    );
  });

  it("preserves partially saved providers and retries only the remaining unsaved draft", async () => {
    let openRouterFailures = 0;

    invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "save_provider") {
        const provider = args?.provider as
          | { name: string; id: string; enabled: boolean }
          | undefined;

        if (provider?.name === "Local Revised") {
          return {
            id: provider.id,
            name: provider.name,
            baseUrl: "http://localhost:11434/v1",
            model: "gpt-oss",
            apiKey: "",
            hasSecret: true,
            secretUpdatedAt: "2026-03-12T00:00:00Z",
            local: true,
            enabled: provider.enabled,
          };
        }

        if (provider?.name === "OpenRouter") {
          openRouterFailures += 1;

          if (openRouterFailures === 1) {
            throw new Error("save provider failed");
          }

          return {
            id: provider.id,
            name: provider.name,
            baseUrl: "",
            model: "",
            apiKey: "",
            hasSecret: false,
            secretUpdatedAt: null,
            local: false,
            enabled: provider.enabled,
          };
        }
      }

      return defaultInvokeImplementation(command, args);
    });

    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    const providersButton = findButton(view.container, "Providers");
    expect(providersButton).toBeTruthy();

    await act(async () => {
      providersButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const initialSaveProviderCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "save_provider",
    ).length;

    const existingProviderName = view.container.querySelector(
      'input[aria-label="Provider name"]',
    ) as HTMLInputElement | null;

    await act(async () => {
      if (!existingProviderName) {
        throw new Error("Existing provider name input missing");
      }
      setFormValue(existingProviderName, "Local Revised");
    });

    const addProviderButton = findButton(view.container, "+ Add Provider");
    expect(addProviderButton).toBeTruthy();

    await act(async () => {
      addProviderButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const providerNameInputs = Array.from(
      view.container.querySelectorAll('input[aria-label="Provider name"]'),
    ) as HTMLInputElement[];
    const newestProvider = providerNameInputs[providerNameInputs.length - 1] ?? null;

    await act(async () => {
      if (!newestProvider) {
        throw new Error("Newest provider input missing");
      }
      setFormValue(newestProvider, "OpenRouter");
    });

    const saveProviders = findButton(view.container, "Save Provider Changes");
    expect(saveProviders).toBeTruthy();

    await act(async () => {
      saveProviders?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(findText(view.container, "save provider failed")).toBeTruthy();
    expect(invokeMock).not.toHaveBeenCalledWith(
      "save_settings",
      expect.objectContaining({
        payload: expect.anything(),
      }),
    );

    await act(async () => {
      saveProviders?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const saveProviderCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "save_provider",
    );
    const retryCalls = saveProviderCalls.slice(initialSaveProviderCalls + 2);

    expect(retryCalls).toHaveLength(1);
    expect(retryCalls[0]?.[1]).toEqual(
      expect.objectContaining({
        provider: expect.objectContaining({ name: "OpenRouter" }),
      }),
    );
  });

  it("switches the expanded section and saves runtime toggles through tauri", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    const runtimeButton = findButton(view.container, "Runtime");
    expect(runtimeButton).toBeTruthy();

    await act(async () => {
      runtimeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(findText(view.container, "Close behavior")).toBeTruthy();
    expect(findText(view.container, "Runtime")).toBeTruthy();

    const launchToggle = view.container.querySelector(
      'input[aria-label="Launch at login"]',
    ) as HTMLInputElement | null;
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

    expect(invokeMock).toHaveBeenCalledWith(
      "save_settings",
      expect.objectContaining({
        payload: expect.objectContaining({ launchAtLogin: true }),
      }),
    );
  });
});
