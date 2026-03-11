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
  it("renders the compact in-app logo from the shipped png asset", async () => {
    const view = await renderIntoDocument(<NukaLogo size={112} />);
    cleanups.push(view.cleanup);

    const logo = view.container.querySelector('[data-brand-kind="mark"]');
    const image = view.container.querySelector("img");

    expect(logo?.getAttribute("data-brand-source")).toBe("goodlogo-png");
    expect(image?.getAttribute("src")).toContain("goodlogo");
    expect(image?.getAttribute("alt")).toBe("");
  });

  it("renders the new lockup source for expanded branding", async () => {
    const view = await renderIntoDocument(
      <div>
        <NukaLockup width={160} />
        <NukaLockup width={180} />
      </div>,
    );
    cleanups.push(view.cleanup);

    const lockups = Array.from(view.container.querySelectorAll('[data-brand-kind="lockup"]'));

    expect(lockups).toHaveLength(2);
    expect(lockups[0]?.getAttribute("data-brand-source")).toBe("nuka-svg");
    expect(lockups[1]?.getAttribute("data-brand-source")).toBe("nuka-svg");
  });
});
