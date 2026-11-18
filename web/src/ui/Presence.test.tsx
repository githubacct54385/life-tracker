import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAVE_MS, Presence } from "./Presence";
import { readFileSync } from "node:fs";

function setReducedMotion(reduced: boolean) {
  window.matchMedia = ((query: string) => ({ matches: reduced && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  // @ts-expect-error tests run without matchMedia by default (jsdom)
  delete window.matchMedia;
});

describe("Presence", () => {
  beforeEach(() => vi.useFakeTimers());

  it("[AC-SET-02.6] shows a panel with the enter animation and keeps it on screen while it leaves", () => {
    setReducedMotion(false);
    const { rerender, container } = render(<Presence>{null}</Presence>);
    expect(screen.queryByText("Panel")).toBeNull();
    rerender(<Presence><p>Panel</p></Presence>);
    expect(screen.getByText("Panel")).toBeTruthy();
    expect(container.querySelector(".lt-enter")).not.toBeNull();

    rerender(<Presence>{null}</Presence>);
    expect(screen.getByText("Panel")).toBeTruthy(); // still there, fading out
    expect(container.querySelector(".lt-leave")).not.toBeNull();
    act(() => void vi.advanceTimersByTime(LEAVE_MS + 10));
    expect(screen.queryByText("Panel")).toBeNull();
  });

  it("[AC-SET-02.6] a panel that comes back during its leave animation is shown again, not removed", () => {
    setReducedMotion(false);
    const { rerender } = render(<Presence><p>Panel</p></Presence>);
    rerender(<Presence>{null}</Presence>);
    act(() => void vi.advanceTimersByTime(LEAVE_MS / 2));
    rerender(<Presence><p>Panel</p></Presence>);
    act(() => void vi.advanceTimersByTime(LEAVE_MS * 2));
    expect(screen.getByText("Panel")).toBeTruthy();
  });

  it("[AC-SET-02.6] with reduced motion there is no animation and nothing waits", () => {
    setReducedMotion(true);
    const { rerender, container } = render(<Presence><p>Panel</p></Presence>);
    rerender(<Presence>{null}</Presence>);
    expect(screen.queryByText("Panel")).toBeNull();
    expect(container.querySelector(".lt-leave")).toBeNull();
  });

  it("[AC-SET-02.6] the stylesheet turns every animation and transition off for reduced motion", () => {
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const rule of [".lt-enter", ".lt-leave", ".lt-page", "transition: none"]) expect(reduced).toContain(rule);
  });
});
