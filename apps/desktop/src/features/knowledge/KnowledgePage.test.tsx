import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgePage } from "./KnowledgePage";
import { findText, renderIntoDocument } from "@/test/render";

const {
  defaultInvokeImplementation,
  invokeMock,
  resetMocks,
  seedLibrary,
} = vi.hoisted(() => {
  const libraries: any[] = [];
  const jobs = new Map<string, any[]>();

  const defaultInvokeImplementation = async (command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case "list_knowledge_libraries":
        return libraries;
      case "add_folder_connector": {
        const path = String(args?.path ?? "");
        const collectionId = String(args?.collectionId ?? "");
        const library = libraries.find((item) => item.id === collectionId);

        if (!library) {
          throw new Error(`knowledge library not found: ${collectionId}`);
        }

        const connector = {
          id: `connector-${library.connectors.length + 1}`,
          kind: "local_folder",
          label: path.split(/[\\/]/).filter(Boolean).pop() || path,
          path,
          enabled: true,
        };

        library.connectors.push(connector);
        return library;
      }
      case "list_index_jobs": {
        const collectionId = String(args?.collectionId ?? "");
        return jobs.get(collectionId) ?? [];
      }
      case "rebuild_knowledge_library": {
        const collectionId = String(args?.collectionId ?? "");
        const nextJob = {
          id: `job-${collectionId}`,
          collectionId,
          status: "ready",
          detail: "Index rebuilt",
        };
        jobs.set(collectionId, [nextJob]);
        return nextJob;
      }
      case "search_knowledge": {
        const query = String(args?.query ?? "");
        return [
          {
            collectionId: "library-1",
            collectionName: "Rust Docs",
            path: "C:/docs/rust",
            snippet: `Matched ${query}`,
          },
        ];
      }
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  };

  const invokeMock = vi.fn(async (command: string, args?: Record<string, unknown>) =>
    defaultInvokeImplementation(command, args),
  );

  const resetMocks = () => {
    libraries.length = 0;
    jobs.clear();
    invokeMock.mockClear();
    invokeMock.mockImplementation(defaultInvokeImplementation);
  };

  const seedLibrary = (library: any, libraryJobs: any[] = []) => {
    libraries.push(structuredClone(library));
    jobs.set(library.id, structuredClone(libraryJobs));
  };

  return {
    defaultInvokeImplementation,
    invokeMock,
    resetMocks,
    seedLibrary,
  };
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
  seedLibrary(
    {
      id: "library-1",
      name: "Rust Docs",
      description: "Core language references",
      engine: {
        id: "pageindex",
        label: "PageIndex",
        health: "healthy",
        capabilities: ["local-folder-connectors", "indexing", "retrieval"],
      },
      connectors: [
        {
          id: "connector-1",
          kind: "local_folder",
          label: "Rust Sources",
          path: "C:/docs/rust",
          enabled: true,
        },
      ],
      supportedExtensions: ["md", "rs"],
    },
    [{ id: "job-library-1", collectionId: "library-1", status: "ready", detail: "Index rebuilt" }],
  );
});

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(text),
  );
}

function setFormValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

async function clickButton(container: HTMLElement, text: string) {
  const button = findButton(container, text);
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("KnowledgePage", () => {
  it("shows a path input first when no knowledge connector exists", async () => {
    resetMocks();
    seedLibrary({
      id: "library-1",
      name: "User Knowledge Base",
      description: "",
      engine: {
        id: "pageindex",
        label: "PageIndex",
        health: "healthy",
        capabilities: ["retrieval"],
      },
      connectors: [],
      supportedExtensions: ["md", "txt"],
    });

    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    expect(view.container.querySelector('input[aria-label="Folder path"]')).toBeTruthy();
    expect(findButton(view.container, "Add Folder")).toBeTruthy();
    expect(findButton(view.container, "Rebuild Index")).toBeFalsy();
    expect(view.container.querySelector('input[aria-label="Search knowledge"]')).toBeFalsy();
    expect(view.container.textContent).not.toContain("Jobs");
    expect(view.container.textContent).not.toContain("Engine Summary");
    expect(view.container.textContent).not.toContain(
      "Attach the first local folder before search and diagnostics appear.",
    );
  });

  it("shows search and source list first once the library has connectors", async () => {
    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    expect(view.container.querySelector('input[aria-label="Search knowledge"]')).toBeTruthy();
    expect(findText(view.container, "Rust Sources")).toBeTruthy();
    expect(findText(view.container, "C:/docs/rust")).toBeTruthy();
    expect(findButton(view.container, "Jobs")).toBeFalsy();
    expect(findButton(view.container, "Engine")).toBeFalsy();
  });

  it("shows path and snippet when a search returns matches", async () => {
    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    const searchInput = view.container.querySelector(
      'input[aria-label="Search knowledge"]',
    ) as HTMLInputElement | null;

    await act(async () => {
      if (!searchInput) {
        throw new Error("Search input missing");
      }

      setFormValue(searchInput, "rust");
    });

    await clickButton(view.container, "Search");

    expect(findText(view.container, "C:/docs/rust")).toBeTruthy();
    expect(findText(view.container, "Matched rust")).toBeTruthy();
  });

  it("keeps rebuild feedback inline while engine details stay secondary", async () => {
    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "Rebuild Index");

    expect(findText(view.container, "Index rebuilt")).toBeTruthy();
    expect(findText(view.container, "Engine details")).toBeTruthy();
    expect(findText(view.container, "Knowledge Inspector")).toBeFalsy();
    expect(findButton(view.container, "Jobs")).toBeFalsy();
  });

  it("shows the latest rebuild feedback inline when multiple index jobs exist", async () => {
    resetMocks();
    seedLibrary(
      {
        id: "library-1",
        name: "Rust Docs",
        description: "Core language references",
        engine: {
          id: "pageindex",
          label: "PageIndex",
          health: "healthy",
          capabilities: ["local-folder-connectors", "indexing", "retrieval"],
        },
        connectors: [
          {
            id: "connector-1",
            kind: "local_folder",
            label: "Rust Sources",
            path: "C:/docs/rust",
            enabled: true,
          },
        ],
        supportedExtensions: ["md", "rs"],
      },
      [
        { id: "job-library-1-1", collectionId: "library-1", status: "ready", detail: "Indexed 4 files" },
        { id: "job-library-1-2", collectionId: "library-1", status: "ready", detail: "Indexed 9 files" },
      ],
    );

    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    const inlineNote = view.container.querySelector(".knowledge-inline-note");

    expect(inlineNote?.textContent).toContain("Indexed 9 files");
    expect(inlineNote?.textContent).not.toContain("Indexed 4 files");
  });
});
