import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentsPage } from "./AgentsPage";
import { findText, renderIntoDocument } from "@/test/render";

const RESEARCH_ARCHETYPE = {
  key: "research-analysis",
  family: "research-analysis",
  title: "Research & Analysis",
  domainFocus: "Research, synthesis, and evidence-backed recommendations.",
  objectivePattern: "Gather context, compare options, and produce a concise brief.",
  communicationStyle: "Calm, cited, and structured.",
  defaultToolPosture: "Use retrieval before generation and keep tool use bounded.",
  memoryPosture: "Retain durable findings and active watch items only.",
  escalationPosture: "Escalate when evidence conflicts or confidence is low.",
  safetyPosture: "Flag missing sources and avoid unsupported claims.",
  outputContract: "Summaries with findings, sources, and next actions.",
};

const HOUSEHOLD_ARCHETYPE = {
  key: "household-logistics",
  family: "household-logistics",
  title: "Household Logistics",
  domainFocus: "Household coordination, errands, and personal logistics.",
  objectivePattern: "Turn requests into clear plans with owners, timing, and tradeoffs.",
  communicationStyle: "Direct, practical, and low-friction.",
  defaultToolPosture: "Use only the tools needed to confirm schedules and track tasks.",
  memoryPosture: "Remember routines, constraints, and recurring obligations.",
  escalationPosture: "Escalate when timing, budget, or household constraints conflict.",
  safetyPosture: "Avoid unsafe recommendations and surface missing details early.",
  outputContract: "Action plans, checklists, and concise status updates.",
};

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
            archetype: RESEARCH_ARCHETYPE,
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
          archetype: args?.archetype ?? HOUSEHOLD_ARCHETYPE,
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

function setInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  valueSetter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
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

  it("shows only the generation surface when no agents exist", async () => {
    invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "list_agents") {
        return [];
      }

      return defaultInvokeImplementation(command, args);
    });

    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    expect(findButton(view.container, "Create")).toBeTruthy();
    expect(view.container.querySelector('[aria-label="Agent request"]')).toBeTruthy();
    expect(view.container.textContent).not.toContain("Agent Details");
    expect(view.container.textContent).not.toContain("Agent Library");
    expect(view.container.querySelector('[data-testid="agents-list"]')).toBeFalsy();
    expect(view.container.querySelector('[data-testid="agents-detail"]')).toBeFalsy();
  });

  it("lists saved agents from the backend", async () => {
    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Researcher")).toBeTruthy();
    expect(findText(view.container, "Synthesis and retrieval")).toBeTruthy();
  });

  it("shows saved agents in a list with inline detail instead of a duplicate inspector", async () => {
    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    expect(view.container.querySelector('[data-testid="agents-list"]')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="agents-detail"]')).toBeTruthy();
    expect(view.container.textContent).not.toContain("Agent Library");
    expect(view.container.textContent).not.toContain("Agent Details");
    expect(findText(view.container, "Summarize findings and cite sources.")).toBeTruthy();
    expect(findText(view.container, "search_knowledge")).toBeTruthy();
    expect(findText(view.container, "Provider")).toBeTruthy();
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

  it("starts with an archetype-first creation flow and sends the selected built-in archetype", async () => {
    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    const archetypeFamily = view.container.querySelector(
      'select[aria-label="Archetype family"]',
    ) as HTMLSelectElement | null;
    const createButton = findButton(view.container, "Create");

    expect(archetypeFamily).toBeTruthy();

    await act(async () => {
      if (!archetypeFamily) {
        throw new Error("Archetype family select missing");
      }

      const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      valueSetter?.call(archetypeFamily, "household-logistics");
      archetypeFamily.dispatchEvent(new Event("input", { bubbles: true }));
      archetypeFamily.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "generate_agent_draft",
      expect.objectContaining({
        archetype: expect.objectContaining({
          family: "household-logistics",
          title: "Household Logistics",
          domainFocus: "Household coordination, errands, and personal logistics.",
        }),
      }),
    );
    expect(findText(view.container, "Household Logistics")).toBeTruthy();
  });

  it("lets the editor capture a custom open-ended archetype before saving", async () => {
    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    const archetypeFamily = view.container.querySelector(
      'select[aria-label="Archetype family"]',
    ) as HTMLSelectElement | null;
    const archetypeTitleInput = view.container.querySelector(
      'input[aria-label="Archetype title"]',
    ) as HTMLInputElement | null;
    const domainFocusInput = view.container.querySelector(
      'input[aria-label="Archetype domain focus"]',
    ) as HTMLInputElement | null;
    const createButton = findButton(view.container, "Create");

    expect(archetypeFamily).toBeTruthy();
    expect(archetypeTitleInput).toBeTruthy();
    expect(domainFocusInput).toBeTruthy();

    await act(async () => {
      if (!archetypeFamily || !archetypeTitleInput || !domainFocusInput) {
        throw new Error("Custom archetype inputs missing");
      }

      const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      valueSetter?.call(archetypeFamily, "custom");
      archetypeFamily.dispatchEvent(new Event("input", { bubbles: true }));
      archetypeFamily.dispatchEvent(new Event("change", { bubbles: true }));

      setInputValue(archetypeTitleInput, "Vendor Negotiation");
      setInputValue(domainFocusInput, "Vendor selection, negotiation, and renewal planning.");
    });

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

    expect(invokeMock).toHaveBeenCalledWith(
      "save_agent",
      expect.objectContaining({
        agent: expect.objectContaining({
          archetype: expect.objectContaining({
            family: "custom",
            title: "Vendor Negotiation",
            domainFocus: "Vendor selection, negotiation, and renewal planning.",
          }),
        }),
      }),
    );
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

  it("labels saved-agent save failures separately from draft save failures", async () => {
    invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "save_agent") {
        throw new Error("save failed");
      }

      return defaultInvokeImplementation(command, args);
    });

    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    const saveButton = findButton(view.container, "Save Changes");
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(findText(view.container, "Agent Save Error")).toBeTruthy();
    expect(findText(view.container, "save failed")).toBeTruthy();
  });
});
