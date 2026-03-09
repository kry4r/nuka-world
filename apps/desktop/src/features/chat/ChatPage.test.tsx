import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPage } from "./ChatPage";
import { findText, renderIntoDocument } from "@/test/render";

type ChatMode =
  | { kind: "chat_only" }
  | { kind: "create_workflow" }
  | { kind: "specific_workflow"; workflowId: string };

function routeForMode(mode: ChatMode) {
  switch (mode.kind) {
    case "create_workflow":
      return { kind: "new_workflow" as const };
    case "specific_workflow":
      return { kind: "existing_workflow" as const, workflowId: mode.workflowId };
    case "chat_only":
    default:
      return { kind: "direct_reply" as const };
  }
}

const routeWorldPromptMock = vi.fn(
  async (
    prompt: string,
    sessionId?: string,
    mode: ChatMode = { kind: "chat_only" },
  ) => {
    if (prompt === "Broken provider") {
      throw new Error("default provider is not configured");
    }

    return {
      session: {
        id: sessionId ?? "session-123",
        title: "Summarize today's notes",
        providerId: "provider-local",
        workflowId: mode.kind === "specific_workflow" ? mode.workflowId : null,
        messageCount: sessionId ? 2 : 1,
      },
      route: routeForMode(mode),
      messages: [
        {
          id: sessionId ? "message-user-2" : "message-user-1",
          role: "user" as const,
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
  },
);

vi.mock("@/lib/chat", () => ({
  routeWorldPrompt: (...args: Parameters<typeof routeWorldPromptMock>) =>
    routeWorldPromptMock(...args),
}));

const cleanups: Array<() => Promise<void>> = [];

function getButtonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text,
  );
}

async function setComposerValue(container: HTMLElement, value: string) {
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;

  await act(async () => {
    if (!textarea) {
      throw new Error("textarea missing");
    }

    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
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

function transcriptContents(container: HTMLElement) {
  return Array.from(container.querySelectorAll(".chat-bubble__content")).map(
    (node) => node.textContent?.trim() ?? "",
  );
}

function deferredValue<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

afterEach(async () => {
  routeWorldPromptMock.mockReset();

  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

describe("ChatPage", () => {
  it("renders the chat mode entry points as a single-choice selector on the landing composer", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    const modeSelector = view.container.querySelector('[aria-label="Chat mode"]');
    const chatOnlyOption = getButtonByText(view.container, "Chat only");
    const createWorkflowOption = getButtonByText(view.container, "Create workflow");
    const specificWorkflowOption = getButtonByText(view.container, "Specific workflow");

    expect(
      view.container.querySelector("textarea")?.getAttribute("placeholder"),
    ).toBe("Message World to start a session...");
    expect(
      view.container.querySelector('[aria-label="World chat landing hero"]'),
    ).toBeTruthy();
    expect(modeSelector?.getAttribute("role")).toBe("radiogroup");
    expect(chatOnlyOption?.getAttribute("role")).toBe("radio");
    expect(chatOnlyOption?.getAttribute("aria-checked")).toBe("true");
    expect(chatOnlyOption?.hasAttribute("aria-pressed")).toBe(false);
    expect(createWorkflowOption?.getAttribute("role")).toBe("radio");
    expect(createWorkflowOption?.getAttribute("aria-checked")).toBe("false");
    expect(specificWorkflowOption?.getAttribute("role")).toBe("radio");
    expect(specificWorkflowOption?.getAttribute("aria-checked")).toBe("false");
    expect(findText(view.container, "Context Inspector")).toBeFalsy();
  });

  it("switches into the active chat layout after a backend-backed send", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await setComposerValue(view.container, "Summarize today's notes");
    await clickButton(view.container, "Send");

    expect(routeWorldPromptMock).toHaveBeenCalledWith(
      "Summarize today's notes",
      undefined,
      { kind: "chat_only" },
    );
    expect(findText(view.container, "Context Inspector")).toBeTruthy();
    expect(findText(view.container, "Local \u00b7 gpt-oss")).toBeTruthy();
    expect(findText(view.container, "Summarize today's notes")).toBeTruthy();
    expect(
      view.container.querySelector('[aria-label="World chat landing hero"]'),
    ).toBeFalsy();
    expect(view.container.textContent?.includes("路")).toBe(false);
    expect(view.container.textContent?.includes("鈥")).toBe(false);
  });

  it("renders a truthful backend error state instead of fake fallback text", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await setComposerValue(view.container, "Broken provider");
    await clickButton(view.container, "Send");

    expect(routeWorldPromptMock).toHaveBeenCalledWith(
      "Broken provider",
      undefined,
      { kind: "chat_only" },
    );
    expect(findText(view.container, "Backend Error")).toBeTruthy();
    expect(findText(view.container, "default provider is not configured")).toBeTruthy();
    expect(findText(view.container, "I have staged your request: Broken provider")).toBeFalsy();
  });

  it("requires a workflow selection before sending in specific workflow mode", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "Specific workflow");
    await setComposerValue(view.container, "Review the release checklist");
    await clickButton(view.container, "Send");

    expect(routeWorldPromptMock).not.toHaveBeenCalled();
    expect(findText(view.container, "Select a workflow before sending.")).toBeTruthy();
  });

  it("sends the selected workflow in specific workflow mode", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "Specific workflow");

    const workflowPicker = view.container.querySelector("select") as HTMLSelectElement | null;
    await act(async () => {
      if (!workflowPicker) {
        throw new Error("workflow picker missing");
      }

      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(workflowPicker, "workflow-release-notes");
      workflowPicker.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    await setComposerValue(view.container, "Review the release checklist");
    await clickButton(view.container, "Send");

    expect(routeWorldPromptMock).toHaveBeenCalledWith(
      "Review the release checklist",
      undefined,
      { kind: "specific_workflow", workflowId: "workflow-release-notes" },
    );
  });

  it("sends create workflow mode from the landing composer", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "Create workflow");
    await setComposerValue(view.container, "Draft a release process");
    await clickButton(view.container, "Send");

    expect(routeWorldPromptMock).toHaveBeenCalledWith(
      "Draft a release process",
      undefined,
      { kind: "create_workflow" },
    );
  });

  it("renders suggested next steps and writes the chosen action into the transcript", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await setComposerValue(view.container, "Start a release review");
    await clickButton(view.container, "Send");

    expect(routeWorldPromptMock).toHaveBeenCalledWith(
      "Start a release review",
      undefined,
      { kind: "chat_only" },
    );
    expect(view.container.querySelector('[aria-label="Suggested next steps"]')).toBeTruthy();
    expect(findText(view.container, "Summarize today's notes")).toBeTruthy();
    expect(findText(view.container, "Plan my next workflow")).toBeTruthy();
    expect(findText(view.container, "Review recent changes")).toBeTruthy();

    await clickButton(view.container, "Plan my next workflow");

    expect(routeWorldPromptMock).toHaveBeenLastCalledWith(
      "Plan my next workflow",
      "session-123",
      { kind: "chat_only" },
    );
    expect(transcriptContents(view.container)).toContain("Plan my next workflow");
  });

  it("prevents overlapping sends while routing is active", async () => {
    const firstResponse = {
      session: {
        id: "session-123",
        title: "Summarize today's notes",
        providerId: "provider-local",
        workflowId: null,
        messageCount: 1,
      },
      route: { kind: "direct_reply" as const },
      messages: [
        {
          id: "message-user-1",
          role: "user" as const,
          content: "Start a release review",
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
    const pendingSend = deferredValue<typeof firstResponse>();

    routeWorldPromptMock.mockResolvedValueOnce(firstResponse);
    routeWorldPromptMock.mockImplementationOnce(() => pendingSend.promise);

    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    await setComposerValue(view.container, "Start a release review");
    await clickButton(view.container, "Send");
    await setComposerValue(view.container, "Second turn");
    await clickButton(view.container, "Send");

    const suggestionButton = getButtonByText(view.container, "Plan my next workflow");
    expect(suggestionButton?.hasAttribute("disabled")).toBe(true);

    await clickButton(view.container, "Plan my next workflow");

    const textarea = view.container.querySelector("textarea") as HTMLTextAreaElement | null;
    await act(async () => {
      if (!textarea) {
        throw new Error("textarea missing");
      }

      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(textarea, "Third turn");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
      await Promise.resolve();
    });

    expect(routeWorldPromptMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      pendingSend.resolve({
        ...firstResponse,
        session: {
          ...firstResponse.session,
          messageCount: 2,
        },
        messages: [
          {
            id: "message-user-2",
            role: "user" as const,
            content: "Second turn",
          },
        ],
      });
      await pendingSend.promise;
    });
  });
});
