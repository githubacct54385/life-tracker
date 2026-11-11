import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

// jsdom has no layout, so a fake matchMedia stands in for the browser width.
function setWidth(width: number) {
  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    return {
      matches: width >= min,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

function open(width: number, path = "/") {
  setWidth(width);
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  return screen.getByRole("navigation", { name: "Main" });
}

const labels = (nav: HTMLElement) => within(nav).getAllByRole("link").map((l) => l.textContent);

afterEach(cleanup);

describe("app shell navigation", () => {
  it("[AC-FND-01.2] the home page shows the app name", () => {
    open(1280);
    expect(screen.getByRole("heading", { name: "Life Tracker" })).toBeTruthy();
  });

  it("[AC-FND-04.1] below 640 px navigation is a bottom tab bar with Settings inside More", async () => {
    const nav = open(360);
    expect(nav.dataset.nav).toBe("tabs");
    expect(labels(nav)).toEqual(["Home", "Giving", "Health", "Car", "More"]);
    await userEvent.click(within(nav).getByRole("link", { name: "More" }));
    expect(screen.getByRole("heading", { name: "More" })).toBeTruthy();
    await userEvent.click(screen.getByRole("link", { name: "Settings" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "More" }).getAttribute("aria-current")).toBe("page");
  });

  it("[AC-FND-04.2] from 640 to 1023 px navigation is a left icon rail", () => {
    for (const width of [640, 768, 1023]) {
      const nav = open(width);
      expect(nav.dataset.nav).toBe("rail");
      expect(labels(nav)).toEqual(["Home", "Giving", "Health", "Car", "More"]);
      cleanup();
    }
  });

  it("[AC-FND-04.3] at 1024 px and wider navigation is a left sidebar with Settings", async () => {
    for (const width of [1024, 1280]) {
      const nav = open(width);
      expect(nav.dataset.nav).toBe("sidebar");
      expect(labels(nav)).toEqual(["Home", "Giving", "Health", "Car", "Settings"]);
      cleanup();
    }
    const nav = open(1280);
    await userEvent.click(within(nav).getByRole("link", { name: "Health" }));
    expect(screen.getByRole("heading", { name: "Health" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Health" }).getAttribute("aria-current")).toBe("page");
  });

  it("[AC-FND-04.3] there is no Money destination at any width", () => {
    for (const width of [360, 768, 1280]) {
      const nav = open(width);
      expect(labels(nav)).not.toContain("Money");
      cleanup();
    }
  });

  it("[AC-FND-04.3] the More page is not used on desktop and sends you to Settings", () => {
    open(1280, "/more");
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
  });
});
