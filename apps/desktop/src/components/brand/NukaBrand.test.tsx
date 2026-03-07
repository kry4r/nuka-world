import { afterEach, describe, expect, it } from "vitest";
import { NukaLogo } from "./NukaLogo";
import { NukaLockup } from "./NukaLockup";
import { renderIntoDocument } from "@/test/render";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

describe("Nuka brand assets", () => {
  it("defaults the in-app mark to the geometric brand family", async () => {
    const view = await renderIntoDocument(<NukaLogo />);
    cleanups.push(view.cleanup);

    const svg = view.container.querySelector("svg");
    const path = view.container.querySelector("path");

    expect(svg?.getAttribute("data-brand-kind")).toBe("mark");
    expect(svg?.getAttribute("data-brand-variant")).toBe("geometric");
    expect(path?.getAttribute("fill")).toBe("currentColor");
  });

  it("renders the natural mark family with different geometry when requested", async () => {
    const geometricView = await renderIntoDocument(<NukaLogo />);
    cleanups.push(geometricView.cleanup);

    const naturalView = await renderIntoDocument(<NukaLogo variant="natural" />);
    cleanups.push(naturalView.cleanup);

    const geometricPath = geometricView.container.querySelector("path");
    const naturalPath = naturalView.container.querySelector("path");

    expect(naturalView.container.querySelector("svg")?.getAttribute("data-brand-variant")).toBe("natural");
    expect(naturalPath?.getAttribute("d")).not.toBe(geometricPath?.getAttribute("d"));
  });

  it("renders lockups for both approved brand families", async () => {
    const view = await renderIntoDocument(
      <div>
        <NukaLockup variant="natural" />
        <NukaLockup variant="geometric" />
      </div>,
    );
    cleanups.push(view.cleanup);

    const lockups = Array.from(view.container.querySelectorAll('svg[data-brand-kind="lockup"]'));
    const lockupText = Array.from(view.container.querySelectorAll("text")).map((node) => node.textContent?.trim());

    expect(lockups).toHaveLength(2);
    expect(lockups[0]?.getAttribute("data-brand-variant")).toBe("natural");
    expect(lockups[1]?.getAttribute("data-brand-variant")).toBe("geometric");
    expect(lockupText).toEqual(["Nuka", "Nuka"]);
  });
});
