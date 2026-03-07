import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentsPage } from "./AgentsPage";
import { findText, renderIntoDocument } from "@/test/render";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({ names: ["codex", "git", "search_knowledge"] })),
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

describe("AgentsPage", () => {
  it("shows one-sentence quick create before preset library", async () => {
    const view = await renderIntoDocument(<AgentsPage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Create From One Sentence")).toBeTruthy();
    expect(findText(view.container, "Create")).toBeTruthy();
    expect(findText(view.container, "Preset Library")).toBeTruthy();
  });
});
