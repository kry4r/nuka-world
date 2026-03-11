import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowPage } from "./WorkflowPage";
import { findText, renderIntoDocument } from "@/test/render";

const WORKFLOW_EXPLANATIONS = {
  "workflow-research-brief": {
    workflowId: "workflow-research-brief",
    title: "Research Brief",
    summary: "Turn a rough goal into a clear brief with staged drafting and review.",
    steps: [
      {
        id: "scope",
        title: "Scope intake",
        purpose: "Capture the product goal and framing constraints.",
        executor: "Room coordinator",
        inputSource: "Chat goal",
        output: "Structured workflow brief",
        completion: "Goal and audience are clear",
      },
      {
        id: "draft",
        title: "Draft brief",
        purpose: "Draft the first research brief from the captured scope.",
        executor: "Draft lane",
        inputSource: "Structured workflow brief",
        output: "Research brief draft",
        completion: "Draft is ready for review",
      },
    ],
    dependencies: {
      agents: ["Room coordinator", "Draft lane"],
      toolsAndKnowledge: ["Project notes", "Knowledge search"],
      requiredInputs: ["Goal"],
    },
  },
  "workflow-release-notes": {
    workflowId: "workflow-release-notes",
    title: "Release Notes",
    summary: "Draft, review, and publish release notes with a cleaner publish handoff.",
    steps: [
      {
        id: "collect",
        title: "Collect changes",
        purpose: "Gather changes that belong in the release.",
        executor: "Release reviewer",
        inputSource: "Release scope",
        output: "Confirmed release change list",
        completion: "Candidate changes are validated",
      },
      {
        id: "publish",
        title: "Prepare publish draft",
        purpose: "Turn validated changes into a publish-ready note set.",
        executor: "Publishing lane",
        inputSource: "Confirmed release change list",
        output: "Release notes draft",
        completion: "Draft is ready for approval",
      },
    ],
    dependencies: {
      agents: ["Release reviewer", "Publishing lane"],
      toolsAndKnowledge: ["Knowledge search", "Release changelog"],
      requiredInputs: ["Release scope"],
    },
  },
  "workflow-customer-triage": {
    workflowId: "workflow-customer-triage",
    title: "Customer Triage",
    summary: "Classify and route customer issues with a compact triage loop.",
    steps: [
      {
        id: "triage",
        title: "Classify issue",
        purpose: "Determine severity and routing path.",
        executor: "Triage lane",
        inputSource: "Issue summary",
        output: "Severity and owner suggestion",
        completion: "Issue is categorized",
      },
    ],
    dependencies: {
      agents: ["Triage lane"],
      toolsAndKnowledge: ["Issue history"],
      requiredInputs: ["Issue summary"],
    },
  },
} as const;

const { explainWorkflowMock, reviseWorkflowMock } = vi.hoisted(() => ({
  explainWorkflowMock: vi.fn(async (workflowId: keyof typeof WORKFLOW_EXPLANATIONS) => {
    return WORKFLOW_EXPLANATIONS[workflowId];
  }),
  reviseWorkflowMock: vi.fn(async (workflowId: string, prompt: string) => ({
    workflowId,
    prompt,
    changeSummary: "Split drafting and publishing into clearer review stages.",
    stepChanges: [
      "Add a dedicated review step before publish.",
      "Search the knowledge base before drafting.",
    ],
    dependencyChanges: ["Add Knowledge search before draft generation."],
    outcomeChanges: ["Draft output is now optimized for a publish-ready changelog."],
  })),
}));

vi.mock("@/lib/workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflow")>();

  return {
    ...actual,
    explainWorkflow: (...args: Parameters<typeof explainWorkflowMock>) => explainWorkflowMock(...args),
    reviseWorkflow: (...args: Parameters<typeof reviseWorkflowMock>) => reviseWorkflowMock(...args),
  };
});

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  explainWorkflowMock.mockClear();
  reviseWorkflowMock.mockClear();

  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(text),
  );
}

async function clickButton(container: HTMLElement, text: string) {
  await act(async () => {
    findButton(container, text)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function setTextAreaValue(container: HTMLElement, placeholder: string, value: string) {
  const textarea = Array.from(container.querySelectorAll("textarea")).find(
    (node) => node.getAttribute("placeholder") === placeholder,
  ) as HTMLTextAreaElement | undefined;

  await act(async () => {
    if (!textarea) {
      throw new Error(`textarea missing: ${placeholder}`);
    }

    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("WorkflowPage", () => {
  it("renders a workflow list and explanation view instead of a room workbench", async () => {
    const view = await renderIntoDocument(<WorkflowPage />);
    cleanups.push(view.cleanup);

    await flushEffects();

    expect(explainWorkflowMock).toHaveBeenCalledWith("workflow-research-brief");
    expect(view.container.querySelector('[aria-label="Workflow catalog"]')).toBeTruthy();
    expect(findText(view.container, "Research Brief")).toBeTruthy();
    expect(findText(view.container, "Release Notes")).toBeTruthy();
    expect(findText(view.container, "Overview")).toBeTruthy();
    expect(findText(view.container, "Step flow")).toBeTruthy();
    expect(findText(view.container, "Dependencies")).toBeTruthy();
    expect(findText(view.container, "Improve workflow")).toBeTruthy();
    expect(findText(view.container, "Enter chat")).toBeTruthy();
    expect(findText(view.container, "Workflow Room")).toBeFalsy();
    expect(findText(view.container, "Workflow Context")).toBeFalsy();
    expect(findText(view.container, "Workflow Lobby")).toBeFalsy();
  });

  it("loads a newly selected workflow explanation from the catalog", async () => {
    const view = await renderIntoDocument(<WorkflowPage />);
    cleanups.push(view.cleanup);

    await flushEffects();
    await clickButton(view.container, "Release Notes");
    await flushEffects();

    expect(explainWorkflowMock).toHaveBeenLastCalledWith("workflow-release-notes");
    expect(findText(view.container, "Prepare publish draft")).toBeTruthy();
    expect(findText(view.container, "Release changelog")).toBeTruthy();
  });

  it("renders the workflow detail area inside a dedicated scroll container", async () => {
    const view = await renderIntoDocument(<WorkflowPage />);
    cleanups.push(view.cleanup);

    await flushEffects();

    const catalogScroll = view.container.querySelector('[data-testid="workflow-catalog-scroll"]');
    const detailScroll = view.container.querySelector('[data-testid="workflow-detail-scroll"]');

    expect(catalogScroll).toBeTruthy();
    expect(catalogScroll?.className).toContain("workflow-scrollable");
    expect(detailScroll).toBeTruthy();
    expect(detailScroll?.className).toContain("workflow-scrollable");
    expect(detailScroll?.textContent).toContain("Improve workflow");
  });

  it("shows a revision preview before applying workflow changes", async () => {
    const view = await renderIntoDocument(<WorkflowPage />);
    cleanups.push(view.cleanup);

    await flushEffects();
    await setTextAreaValue(
      view.container,
      "Describe how to improve this workflow...",
      "Search the knowledge base before drafting",
    );
    await clickButton(view.container, "Generate improved version");
    await flushEffects();

    expect(reviseWorkflowMock).toHaveBeenCalledWith(
      "workflow-research-brief",
      "Search the knowledge base before drafting",
    );
    expect(findText(view.container, "Preview changes")).toBeTruthy();
    expect(findText(view.container, "Add a dedicated review step before publish.")).toBeTruthy();
    expect(findText(view.container, "Apply version")).toBeTruthy();
    expect(findText(view.container, "Keep editing")).toBeTruthy();
  });

  it("navigates back to chat from the explanation view", async () => {
    const receivedPages: string[] = [];
    const handleNavigate = (event: Event) => {
      const page = (event as CustomEvent<{ page?: string }>).detail?.page;
      if (page) {
        receivedPages.push(page);
      }
    };

    window.addEventListener("nuka:navigate", handleNavigate as EventListener);

    const view = await renderIntoDocument(<WorkflowPage />);
    cleanups.push(async () => {
      window.removeEventListener("nuka:navigate", handleNavigate as EventListener);
      await view.cleanup();
    });

    await flushEffects();
    await clickButton(view.container, "Enter chat");

    expect(receivedPages).toContain("chat");
  });

  it("uses workflow handoff intent to preselect the incoming workflow", async () => {
    const onIntentHandled = vi.fn();
    const view = await renderIntoDocument(
      <WorkflowPage
        intent={{
          kind: "open_workflow_room",
          workflowId: "workflow-release-notes",
          prompt: "Review the release checklist",
          origin: {
            sourceSessionId: "chat-session-specific",
            sourceMode: "specific_workflow",
          },
        }}
        onIntentHandled={onIntentHandled}
      />,
    );
    cleanups.push(view.cleanup);

    await flushEffects();

    expect(explainWorkflowMock).toHaveBeenLastCalledWith("workflow-release-notes");
    expect(findText(view.container, "Review the release checklist")).toBeTruthy();
    expect(findText(view.container, "Generated from chat")).toBeTruthy();
    expect(onIntentHandled).toHaveBeenCalled();
  });
});
