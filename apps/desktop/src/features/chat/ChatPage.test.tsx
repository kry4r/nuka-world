import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPage } from "./ChatPage";
import { findText, renderIntoDocument } from "@/test/render";

const routeWorldPromptMock = vi.fn(async () => ({
  sessionId: "session-123",
  route: { kind: "direct_reply" as const },
}));

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
  it("renders the refined landing composer before conversation starts", async () => {
    const view = await renderIntoDocument(<ChatPage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Nuka World")).toBeTruthy();
    expect(
      view.container
        .querySelector("textarea")
        ?.getAttribute("placeholder"),
    ).toBe("Message World to start a session...");
    expect(findText(view.container, "Context Inspector")).toBeFalsy();
  });

  it("switches into the active chat layout after the first message", async () => {
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
      valueSetter?.call(textarea, "Plan my next workflow");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(routeWorldPromptMock).toHaveBeenCalledWith("Plan my next workflow", undefined);
    expect(findText(view.container, "Context Inspector")).toBeTruthy();
    expect(
      view.container.querySelector('[aria-label="Conversation quick actions"]'),
    ).toBeTruthy();
  });
});
