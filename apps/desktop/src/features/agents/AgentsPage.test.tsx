import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentsPage } from "./AgentsPage";
import { findText, renderIntoDocument } from "@/test/render";

const { defaultInvokeImplementation, invokeMock } = vi.hoisted(() => ({
  defaultInvokeImplementation: async (
    command: string,
    args?: Record<string, unknown>,
  ) => {
    switch (command) {
      case "default_agent_tool_bindings":
        return { names: ["codex", "git", "search_knowledge"] };
      case "list_agents":
        return [
          {
            id: "agent-researcher",
            name: "Researcher",
            description: "Synthesis and retrieval",
            systemPrompt: "Summarize findings and cite sources.",
            providerId: "provider-local",
            toolNames: ["codex", "search_knowledge"],
          },
        ];
      case "generate_agent_draft":
        return {
          id: "agent-draft-release-digest",
          name: "Release Digest",
          description: "Weekly digest writer",
          systemPrompt: "Write concise weekly release digests.",
          providerId: "provider-local",
          toolNames: ["codex", "git"],
        };
      case "save_agent":
        return args?.agent ?? null;
      case "delete_agent":
        return null;
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  },
  invokeMock: vi.fn(async (command: string, args?: Record<string, unknown>) =>
    defaultInvokeImplementation(command, args),
  ),
}));

const { providerGateState } = vi.hoisted(() => ({
  providerGateState: {
    ready: true,
    blocked: false,
    message: "Provider ready",
    openSettings: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@/hooks/useProviderGate", () => ({
  useProviderGate: () => providerGateState,
}));

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  invokeMock.mockClear();
  invokeMock.mockImplementation(defaultInvokeImplementation);
  providerGateState.ready = true;
  providerGateState.blocked = false;
  providerGateState.message = "Provider ready";
  providerGateState.openSettings.mockReset();

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

describe("AgentsPage", () => {
  it("blocks draft generation until provider ready", async () => {
    providerGateState.ready = false;
    providerGateState.blocked = true;
    providerGateState.message = "Provider required";

    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    const createButton = findButton(view.container, "Create");

    expect(createButton?.hasAttribute("disabled")).toBe(true);
    expect(view.container.textContent).toContain("Provider required");
    expect(view.container.textContent).toContain("Open Settings");
  });

  it("renders an agent library and editor split instead of a generic card grid", async () => {
    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    expect(view.container.querySelector('[data-testid="agents-library"]')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="agents-editor"]')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="agents-quick-create"]')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="agents-card-grid"]')).toBeFalsy();
  });

  it("lists saved agents from the backend", async () => {
    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Researcher")).toBeTruthy();
    expect(findText(view.container, "Synthesis and retrieval")).toBeTruthy();
  });

  it("opens an existing agent detail panel", async () => {
    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    const openAgent = findButton(view.container, "Researcher");
    expect(openAgent).toBeTruthy();

    await act(async () => {
      openAgent?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(findText(view.container, "Agent Details")).toBeTruthy();
    expect(findText(view.container, "Summarize findings and cite sources.")).toBeTruthy();
    expect(findText(view.container, "search_knowledge")).toBeTruthy();
    expect(findText(view.container, "Provider context")).toBeTruthy();
    expect(findText(view.container, "Memory and knowledge bindings")).toBeTruthy();
  });

  it("creates an agent draft via backend draft generation", async () => {
    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    const promptInput = view.container.querySelector('input[aria-label="Agent request"]') as HTMLInputElement | null;
    const createButton = findButton(view.container, "Create");

    await act(async () => {
      if (!promptInput) {
        throw new Error("Agent request input missing");
      }

      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(promptInput, "Create an agent that writes short weekly release digests.");
      promptInput.dispatchEvent(new Event("input", { bubbles: true }));
      promptInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "generate_agent_draft",
      expect.objectContaining({
        prompt: "Create an agent that writes short weekly release digests.",
      }),
    );
    expect(findText(view.container, "Release Digest")).toBeTruthy();
    expect(findText(view.container, "Weekly digest writer")).toBeTruthy();
    expect(findButton(view.container, "Save Agent")).toBeTruthy();
    expect(findButton(view.container, "Delete Agent")).toBeFalsy();
  });

  it("keeps an explicitly empty tool list empty instead of falling back to defaults", async () => {
    invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "list_agents") {
        return [
          {
            id: "agent-empty-tools",
            name: "Observer",
            description: "Review only",
            systemPrompt: "Observe and summarize.",
            providerId: "provider-local",
            toolNames: [],
          },
        ];
      }

      return defaultInvokeImplementation(command, args);
    });

    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Observer")).toBeTruthy();
    expect(findText(view.container, "No tools assigned")).toBeTruthy();
    expect(findText(view.container, "search_knowledge")).toBeFalsy();
  });

  it("shows a visible error when the initial agent load fails", async () => {
    invokeMock.mockImplementationOnce(async () => {
      throw new Error("tool registry offline");
    });

    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Agent Load Error")).toBeTruthy();
    expect(findText(view.container, "tool registry offline")).toBeTruthy();
  });

  it("shows a visible error when saving a draft fails", async () => {
    invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "save_agent") {
        throw new Error("save failed");
      }

      return defaultInvokeImplementation(command, args);
    });

    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    const createButton = findButton(view.container, "Create");

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const saveButton = findButton(view.container, "Save Agent");
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(findText(view.container, "Agent Draft Error")).toBeTruthy();
    expect(findText(view.container, "save failed")).toBeTruthy();
  });

  it("shows a visible error when deleting an agent fails", async () => {
    invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "delete_agent") {
        throw new Error("delete failed");
      }

      return defaultInvokeImplementation(command, args);
    });

    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    const deleteButton = findButton(view.container, "Delete Agent");
    expect(deleteButton).toBeTruthy();

    await act(async () => {
      deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(findText(view.container, "Agent Action Error")).toBeTruthy();
    expect(findText(view.container, "delete failed")).toBeTruthy();
  });
});
