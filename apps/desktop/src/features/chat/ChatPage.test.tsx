import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPage } from "./ChatPage";
import { findText, renderIntoDocument } from "@/test/render";

const routeWorldPromptMock = vi.fn(async (prompt: string, sessionId?: string) => {
  if (prompt === "Broken provider") {
    throw new Error("default provider is not configured");
  }

  return {
    session: {
      id: sessionId ?? "session-123",
      title: "Summarize today's notes",
      providerId: "provider-local",
      workflowId: null,
      messageCount: sessionId ? 2 : 1,
    },
    route: { kind: "direct_reply" as const },
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
});

vi.mock("@/lib/chat", () => ({
  routeWorldPrompt: (...args: Parameters<typeof routeWorldPromptMock>) => routeWorldPromptMock(...args),
}));

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  routeWorldPromptMock.mockClear();

  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

describe("ChatPage", () => {
  it("renders the centered landing composer before conversation starts", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    expect(
      view.container
        .querySelector("textarea")
        ?.getAttribute("placeholder"),
    ).toBe("Message World to start a session...");
    expect(
      view.container.querySelector('[aria-label="World chat landing hero"]'),
    ).toBeTruthy();
    expect(findText(view.container, "Nuka World")).toBeFalsy();
    expect(findText(view.container, "Talk to World and start a new session.")).toBeFalsy();
    expect(findText(view.container, "Context Inspector")).toBeFalsy();
  });

  it("switches into the active chat layout after a backend-backed send", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    const textarea = view.container.querySelector("textarea") as HTMLTextAreaElement | null;
    const sendButton = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Send",
    );

    await act(async () => {
      if (!textarea) {
        throw new Error("textarea missing");
      }

      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(textarea, "Summarize today's notes");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(routeWorldPromptMock).toHaveBeenCalledWith("Summarize today's notes", undefined);
    expect(findText(view.container, "Context Inspector")).toBeTruthy();
    expect(findText(view.container, "Local ¡¤ gpt-oss")).toBeTruthy();
    expect(findText(view.container, "Summarize today's notes")).toBeTruthy();
    expect(
      view.container.querySelector('[aria-label="World chat landing hero"]'),
    ).toBeFalsy();
  });

  it("renders a truthful backend error state instead of fake fallback text", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    const textarea = view.container.querySelector("textarea") as HTMLTextAreaElement | null;
    const sendButton = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Send",
    );

    await act(async () => {
      if (!textarea) {
        throw new Error("textarea missing");
      }

      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(textarea, "Broken provider");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(routeWorldPromptMock).toHaveBeenCalledWith("Broken provider", undefined);
    expect(findText(view.container, "Backend Error")).toBeTruthy();
    expect(findText(view.container, "default provider is not configured")).toBeTruthy();
    expect(findText(view.container, "I have staged your request: Broken provider")).toBeFalsy();
  });
});
