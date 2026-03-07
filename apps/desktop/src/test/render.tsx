import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

export async function renderIntoDocument(element: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const root = createRoot(container);

  await act(async () => {
    root.render(element);
  });

  return {
    container,
    root,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  } satisfies {
    container: HTMLDivElement;
    root: Root;
    cleanup: () => Promise<void>;
  };
}

export function findText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("*")).find(
    (node) => node.textContent?.trim() === text,
  );
}
