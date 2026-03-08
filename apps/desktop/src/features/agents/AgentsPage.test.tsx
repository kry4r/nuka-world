import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentsPage } from "./AgentsPage";
import { findText, renderIntoDocument } from "@/test/render";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async (command: string, args?: Record<string, unknown>) => {
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
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  invokeMock.mockClear();

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
  });
});
