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
            archetype: {
              id: "archetype-research",
              title: "Research Analyst",
              family: "research_and_analysis",
              domainFocus: "Research synthesis",
              objectivePattern: "Investigate and summarize",
              communicationStyle: "Calm and evidence-first",
              defaultToolPosture: "Prefer search and synthesis",
              memoryPosture: "Keep durable findings",
              escalationPosture: "Escalate when evidence conflicts",
              safetyPosture: "Avoid unsupported claims",
              outputContract: "Return a findings brief",
            },
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
          archetype: {
            id: "archetype-operations",
            title: "Operations Coordinator",
            family: "operations",
            domainFocus: "Operational follow-through",
            objectivePattern: "Plan, coordinate, and close loops",
            communicationStyle: "Clear and directive",
            defaultToolPosture: "Prefer low-cost coordination tools",
            memoryPosture: "Retain durable checkpoints",
            escalationPosture: "Escalate on unresolved blockers",
            safetyPosture: "Pause before destructive actions",
            outputContract: "Return a checkpoint plan",
          },
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
    expect(findText(view.container, "Research Analyst")).toBeTruthy();
    expect(findText(view.container, "research_and_analysis")).toBeTruthy();
  });

  it("shows the full archetype operating frame and keeps the detail column scrollable", async () => {
    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    const main = view.container.querySelector(".agents-page__main");

    expect(main?.className).toContain("agents-page__main--scrollable");
    expect(view.container.querySelector('[aria-label="Archetype domain focus"]')).toBeTruthy();
    expect(view.container.querySelector('[aria-label="Archetype objective pattern"]')).toBeTruthy();
    expect(view.container.querySelector('[aria-label="Archetype communication style"]')).toBeTruthy();
    expect(view.container.querySelector('[aria-label="Archetype default tool posture"]')).toBeTruthy();
    expect(view.container.querySelector('[aria-label="Archetype memory posture"]')).toBeTruthy();
    expect(view.container.querySelector('[aria-label="Archetype escalation posture"]')).toBeTruthy();
    expect(view.container.querySelector('[aria-label="Archetype safety posture"]')).toBeTruthy();
    expect(view.container.querySelector('[aria-label="Archetype output contract"]')).toBeTruthy();
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
    expect(findText(view.container, "Operations Coordinator")).toBeTruthy();
    expect(findButton(view.container, "Save Agent")).toBeTruthy();
    expect(findButton(view.container, "Delete Agent")).toBeFalsy();
  });

  it("saves custom non-software archetype metadata from the editor", async () => {
    const savedAgents: Array<Record<string, unknown>> = [];
    invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "save_agent") {
        savedAgents.push(args?.agent as Record<string, unknown>);
        return args?.agent ?? null;
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

    const titleInput = view.container.querySelector(
      'input[aria-label="Archetype title"]',
    ) as HTMLInputElement | null;
    const familyInput = view.container.querySelector(
      'input[aria-label="Archetype family"]',
    ) as HTMLInputElement | null;
    const saveButton = findButton(view.container, "Save Agent");

    await act(async () => {
      if (!titleInput || !familyInput) {
        throw new Error("archetype inputs missing");
      }

      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(titleInput, "Household Planner");
      titleInput.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(familyInput, "household_and_personal_logistics");
      familyInput.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(savedAgents).toHaveLength(1);
    expect(savedAgents[0]?.archetype).toEqual(
      expect.objectContaining({
        title: "Household Planner",
        family: "household_and_personal_logistics",
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
