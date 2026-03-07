import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";
import { findText, renderIntoDocument } from "@/test/render";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({ count: 0, names: [] })),
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

describe("SettingsPage", () => {
  it("keeps providers inside settings", async () => {
    const view = await renderIntoDocument(<SettingsPage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Application Settings")).toBeTruthy();
    expect(findText(view.container, "Providers")).toBeTruthy();
    expect(findText(view.container, "Current Section")).toBeTruthy();
  });
});
