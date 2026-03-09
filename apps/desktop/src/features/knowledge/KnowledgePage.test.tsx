import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgePage } from "./KnowledgePage";
import { findText, renderIntoDocument } from "@/test/render";

const {
  defaultInvokeImplementation,
  invokeMock,
  resetMocks,
  seedLibrary,
  setCommandFailure,
  setIndexJobsFailure,
} = vi.hoisted(() => {
  const libraries: any[] = [];
  const jobs = new Map<string, any[]>();
  const commandFailures = new Map<string, string>();
  const indexJobsFailures = new Map<string, string>();

  const defaultInvokeImplementation = async (command: string, args?: Record<string, unknown>) => {
    const commandFailure = commandFailures.get(command);
    if (commandFailure) {
      throw new Error(commandFailure);
    }

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
        const failure = indexJobsFailures.get(collectionId);
        if (failure) {
          throw new Error(failure);
        }
        return jobs.get(collectionId) ?? [];
      }
      case "rebuild_knowledge_library": {
        const collectionId = String(args?.collectionId ?? "");
        const library = libraries.find((item) => item.id === collectionId);

        if (!library) {
          throw new Error(`knowledge library not found: ${collectionId}`);
        }

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
        if (query === "explode") {
          throw new Error("pageindex runtime missing");
        }
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
    commandFailures.clear();
    indexJobsFailures.clear();
    invokeMock.mockClear();
    invokeMock.mockImplementation(defaultInvokeImplementation);
  };

  const seedLibrary = (library: any, libraryJobs: any[] = []) => {
    libraries.push(structuredClone(library));
    jobs.set(library.id, structuredClone(libraryJobs));
  };

  const setCommandFailure = (command: string, message: string) => {
    commandFailures.set(command, message);
  };

  const setIndexJobsFailure = (collectionId: string, message: string) => {
    indexJobsFailures.set(collectionId, message);
  };

  return {
    defaultInvokeImplementation,
    invokeMock,
    resetMocks,
    seedLibrary,
    setCommandFailure,
    setIndexJobsFailure,
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
        label: "PageIndex Core",
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
  seedLibrary(
    {
      id: "library-2",
      name: "Release Notes",
      description: "Shipped product notes",
      engine: {
        id: "rag-adapter",
        label: "RAG Adapter",
        health: "degraded",
        capabilities: ["connectors", "retrieval"],
      },
      connectors: [
        {
          id: "connector-2",
          kind: "local_folder",
          label: "Release Sources",
          path: "C:/docs/releases",
          enabled: true,
        },
      ],
      supportedExtensions: ["md", "txt"],
    },
    [{ id: "job-library-2", collectionId: "library-2", status: "queued", detail: "Waiting for engine" }],
  );
});

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(text),
  );
}

function setFormValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
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
  it("renders libraries in a persistent explorer while switching workbench modes", async () => {
    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Library Explorer")).toBeTruthy();
    expect(findText(view.container, "Rust Docs")).toBeTruthy();
    expect(findText(view.container, "Release Notes")).toBeTruthy();
    expect(findText(view.container, "Search Lab")).toBeTruthy();

    await clickButton(view.container, "Sources");
    expect(findText(view.container, "Source Connectors")).toBeTruthy();
    expect(findText(view.container, "Library Explorer")).toBeTruthy();

    await clickButton(view.container, "Jobs");
    expect(findText(view.container, "Index Jobs")).toBeTruthy();
    expect(findText(view.container, "Rust Docs")).toBeTruthy();

    await clickButton(view.container, "Engine");
    expect(findText(view.container, "Engine Summary")).toBeTruthy();
    expect(findText(view.container, "Release Notes")).toBeTruthy();

    await clickButton(view.container, "Search");
    expect(findText(view.container, "Search Lab")).toBeTruthy();
  });

  it("shows the current scope in the workbench header and updates it when library selection changes", async () => {
    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    const scope = view.container.querySelector('[data-testid="knowledge-current-scope"]');
    expect(scope?.textContent).toContain("Current Scope");
    expect(scope?.textContent).toContain("Rust Docs");

    await clickButton(view.container, "Release Notes");

    expect(scope?.textContent).toContain("Release Notes");
  });

  it("adds a connector into the selected library instead of creating a new library", async () => {
    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    const pathInput = view.container.querySelector('input[aria-label="Folder path"]') as HTMLInputElement | null;

    await act(async () => {
      if (!pathInput) {
        throw new Error("Folder path input missing");
      }

      setFormValue(pathInput, "C:/docs/rust-book");
    });

    await clickButton(view.container, "Add Folder");

    expect(invokeMock).toHaveBeenCalledWith("add_folder_connector", {
      collectionId: "library-1",
      path: "C:/docs/rust-book",
    });
    expect(findText(view.container, "Source Connectors")).toBeTruthy();
    expect(findText(view.container, "Rust Sources")).toBeTruthy();
    expect(findText(view.container, "rust-book")).toBeTruthy();
    expect(findText(view.container, "Release Notes")).toBeTruthy();
  });

  it("labels cross-library search hits truthfully instead of implying they belong to the selected library", async () => {
    invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "search_knowledge") {
        return [
          {
            collectionId: "library-2",
            collectionName: "Release Notes",
            path: "C:/docs/releases",
            snippet: "Matched release",
          },
        ];
      }

      return defaultInvokeImplementation(command, args);
    });

    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    const searchInput = view.container.querySelector(
      'input[aria-label="Search knowledge"]',
    ) as HTMLInputElement | null;

    await act(async () => {
      if (!searchInput) {
        throw new Error("Search input missing");
      }

      setFormValue(searchInput, "release");
    });

    await clickButton(view.container, "Search");

    const description = view.container.querySelector(
      '[data-testid="knowledge-search-lab-description"]',
    );

    expect(description?.textContent).toContain("all indexed libraries");
    expect(findText(view.container, "Release Notes")).toBeTruthy();
    expect(findText(view.container, "C:/docs/releases")).toBeTruthy();
    expect(findText(view.container, "Search results across Rust Docs and related indexed sources.")).toBeFalsy();
  });

  it("shows engine health and capabilities separately from source metadata", async () => {
    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "Engine");

    expect(findText(view.container, "Engine Summary")).toBeTruthy();
    expect(findText(view.container, "PageIndex Core")).toBeTruthy();
    expect(findText(view.container, "healthy")).toBeTruthy();
    expect(findText(view.container, "local-folder-connectors")).toBeTruthy();
    expect(findText(view.container, "retrieval")).toBeTruthy();

    await clickButton(view.container, "Sources");

    expect(findText(view.container, "Source Connectors")).toBeTruthy();
    expect(findText(view.container, "Rust Sources")).toBeTruthy();
    expect(findText(view.container, "C:/docs/rust")).toBeTruthy();
  });

  it("shows engine-to-library bindings in engine mode instead of only the selected library summary", async () => {
    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "Engine");

    const bindings = view.container.querySelector('[data-testid="knowledge-engine-bindings"]');

    expect(bindings?.textContent).toContain("Rust Docs");
    expect(bindings?.textContent).toContain("Release Notes");
    expect(bindings?.textContent).toContain("PageIndex Core");
    expect(bindings?.textContent).toContain("RAG Adapter");
  });

  it("uses guided empty states for search and source connectors", async () => {
    resetMocks();
    seedLibrary({
      id: "library-empty",
      name: "Empty Library",
      description: "",
      engine: {
        id: "pageindex",
        label: "PageIndex Core",
        health: "healthy",
        capabilities: ["local-folder-connectors", "indexing", "retrieval"],
      },
      connectors: [],
      supportedExtensions: ["md"],
    });

    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Run a search above to compare what each indexed library can answer.")).toBeTruthy();

    await clickButton(view.container, "Sources");

    expect(findText(view.container, "Add a folder path above to attach the first source connector for Empty Library.")).toBeTruthy();
  });

  it("surfaces an initial library load failure instead of collapsing to an empty state", async () => {
    resetMocks();
    setCommandFailure("list_knowledge_libraries", "knowledge backend offline");

    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    expect(findText(view.container, "Knowledge Error")).toBeTruthy();
    expect(findText(view.container, "knowledge backend offline")).toBeTruthy();
    expect(findText(view.container, "No libraries connected yet.")).toBeFalsy();
  });

  it("surfaces a per-library job load failure instead of showing an empty jobs panel", async () => {
    setIndexJobsFailure("library-1", "jobs backend offline");

    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "Jobs");

    expect(findText(view.container, "Knowledge Error")).toBeTruthy();
    expect(findText(view.container, "jobs backend offline")).toBeTruthy();
    expect(findText(view.container, "No index jobs recorded yet.")).toBeFalsy();
  });

  it("surfaces add-folder failures with actionable feedback", async () => {
    setCommandFailure("add_folder_connector", "connector permission denied");
    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    const pathInput = view.container.querySelector('input[aria-label="Folder path"]') as HTMLInputElement | null;

    await act(async () => {
      if (!pathInput) {
        throw new Error("Folder path input missing");
      }

      setFormValue(pathInput, "C:/docs/restricted");
    });

    await clickButton(view.container, "Add Folder");

    expect(findText(view.container, "Knowledge Error")).toBeTruthy();
    expect(findText(view.container, "connector permission denied")).toBeTruthy();
    expect(pathInput?.value).toBe("C:/docs/restricted");
  });

  it("surfaces rebuild failures with actionable feedback", async () => {
    setCommandFailure("rebuild_knowledge_library", "index rebuild failed");
    const view = await renderIntoDocument(<KnowledgePage />);
    cleanups.push(view.cleanup);

    await clickButton(view.container, "Jobs");
    await clickButton(view.container, "Rebuild Index");

    expect(findText(view.container, "Knowledge Error")).toBeTruthy();
    expect(findText(view.container, "index rebuild failed")).toBeTruthy();
  });
});
