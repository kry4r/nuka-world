import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgePage } from "./KnowledgePage";
import { findText, renderIntoDocument } from "@/test/render";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({ id: "library-user", name: "Personal Library" })),
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

describe("KnowledgePage", () => {
  it("shows connectors and normalized hierarchy", async () => {
    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "External Knowledge Connectors")).toBeTruthy();
    expect(findText(view.container, "GitHub")).toBeTruthy();
    expect(findText(view.container, "Library")).toBeTruthy();
    expect(findText(view.container, "Chunk")).toBeTruthy();
  });
});
