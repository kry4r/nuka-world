import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryPage } from "./MemoryPage";
import { findText, renderIntoDocument } from "@/test/render";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({ canPromote: true })),
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

describe("MemoryPage", () => {
  it("shows graph-first layered memory view", async () => {
    const view = await renderIntoDocument(<MemoryPage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Schema Memory Graph")).toBeTruthy();
    expect(findText(view.container, "Global User")).toBeTruthy();
    expect(findText(view.container, "Session")).toBeTruthy();
  });
});
