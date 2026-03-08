import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgePage } from "./KnowledgePage";
import { findText, renderIntoDocument } from "@/test/render";

const { invokeMock, resetMocks } = vi.hoisted(() => {
  const libraries: Array<{
    id: string;
    name: string;
    description: string;
    engine: string;
    connectors: Array<{ id: string; kind: string; path: string; enabled: boolean }>;
    supportedExtensions: string[];
  }> = [];
  const jobs = new Map<string, Array<{ id: string; collectionId: string; status: string; detail: string | null }>>();

  const invokeMock = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case "list_knowledge_libraries":
        return libraries;
      case "add_folder_connector": {
        const path = String(args?.path ?? "");
        const library = {
          id: `library-${libraries.length + 1}`,
          name: path.split(/[\\/]/).filter(Boolean).pop() || path,
          description: "Local folder connector",
          engine: "pageindex",
          connectors: [{ id: `connector-${libraries.length + 1}`, kind: "local_folder", path, enabled: true }],
          supportedExtensions: ["md", "txt", "json", "yaml", "yml", "pdf", "rs", "ts", "tsx", "py"],
        };
        libraries.push(library);
        jobs.set(library.id, [{ id: `job-${library.id}`, collectionId: library.id, status: "ready", detail: "Index rebuilt" }]);
        return library;
      }
      case "list_index_jobs":
        return jobs.get(String(args?.collectionId ?? "")) ?? [];
      case "rebuild_knowledge_library": {
        const collectionId = String(args?.collectionId ?? "");
        const nextJob = { id: `job-${collectionId}`, collectionId, status: "ready", detail: "Index rebuilt" };
        jobs.set(collectionId, [nextJob]);
        return nextJob;
      }
      case "search_knowledge": {
        const query = String(args?.query ?? "");
        if (query === "explode") {
          throw new Error("pageindex runtime missing");
        }
        return [
          {
            collectionId: "library-1",
            collectionName: "rust",
            path: "C:/docs/rust",
            snippet: `Matched ${query}`,
          },
        ];
      }
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  });

  const resetMocks = () => {
    libraries.length = 0;
    jobs.clear();
    invokeMock.mockClear();
  };

  return { invokeMock, resetMocks };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
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

beforeEach(() => {
  resetMocks();
});

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(text),
  );
}

describe("KnowledgePage", () => {
  it("renders an empty state when no folder connector exists", async () => {
    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "No folder connectors yet.")).toBeTruthy();
  });

  it("adds a folder connector and renders index job state", async () => {
    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    const pathInput = view.container.querySelector('input[aria-label="Folder path"]') as HTMLInputElement | null;
    const addButton = findButton(view.container, "Add Folder");

    await act(async () => {
      if (!pathInput) {
        throw new Error("Folder path input missing");
      }
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(pathInput, "C:/docs/rust");
      pathInput.dispatchEvent(new Event("input", { bubbles: true }));
      pathInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findText(view.container, "rust")).toBeTruthy();
    expect(findText(view.container, "ready")).toBeTruthy();
  });

  it("renders search results from the backend", async () => {
    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    const pathInput = view.container.querySelector('input[aria-label="Folder path"]') as HTMLInputElement | null;
    const addButton = findButton(view.container, "Add Folder");
    const searchInput = () => view.container.querySelector('input[aria-label="Search knowledge"]') as HTMLInputElement | null;
    const searchButton = () => findButton(view.container, "Search");

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(pathInput, "C:/docs/rust");
      pathInput?.dispatchEvent(new Event("input", { bubbles: true }));
      pathInput?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(searchInput(), "rust");
      searchInput()?.dispatchEvent(new Event("input", { bubbles: true }));
      searchInput()?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      searchButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findText(view.container, "Matched rust")).toBeTruthy();
  });

  it("renders a truthful search error state", async () => {
    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    const searchInput = view.container.querySelector('input[aria-label="Search knowledge"]') as HTMLInputElement | null;
    const searchButton = findButton(view.container, "Search");

    await act(async () => {
      if (!searchInput) {
        throw new Error("Search input missing");
      }
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(searchInput, "explode");
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      searchButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findText(view.container, "Search Error")).toBeTruthy();
    expect(findText(view.container, "pageindex runtime missing")).toBeTruthy();
  });
});
