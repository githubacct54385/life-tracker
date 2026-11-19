import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COMPACT_NAV, WIDE_NAV } from "../nav/destinations";
import { Page, documentTitle } from "../pages/Page";
import { CarPage } from "../pages/car/CarPage";
import { HubLink } from "./HubLink";
import { Icon } from "./Icon";
import { Skeleton } from "./Skeleton";

afterEach(cleanup);

describe("navigation icons", () => {
  it("[AC-SET-02.8] every destination has its own icon, and each icon is a drawing hidden from screen readers", () => {
    const all = [...COMPACT_NAV, ...WIDE_NAV];
    expect(new Set(COMPACT_NAV.map((d) => d.icon)).size).toBe(COMPACT_NAV.length);
    for (const dest of all) {
      const { container, unmount } = render(<Icon name={dest.icon} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.querySelectorAll("path, circle, rect").length).toBeGreaterThan(0);
      unmount();
    }
  });
});

describe("page titles", () => {
  it("[AC-SET-02.8] a page sets the browser tab title to its name, and Home is just the app name", () => {
    expect(documentTitle("Giving")).toBe("Giving · Life Tracker");
    expect(documentTitle("Life Tracker")).toBe("Life Tracker");
    render(<Page title="Weight" />);
    expect(document.title).toBe("Weight · Life Tracker");
  });

  it("[AC-SET-02.8] a nested section heading does not change the tab title", () => {
    document.title = "Before";
    render(<Page title="Import history" level={2} />);
    expect(document.title).toBe("Before");
  });
});

describe("loading placeholders", () => {
  it("[AC-SET-02.9] say Loading to screen readers, draw placeholder bars, and stop shimmering for reduced motion", () => {
    render(<Skeleton lines={3} />);
    const status = screen.getByRole("status");
    expect(within(status).getByText("Loading…")).toBeTruthy();
    expect(status.querySelectorAll(".lt-skeleton")).toHaveLength(3);
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8");
    expect(css).toContain(".lt-skeleton { animation: none; }");
  });
});

describe("section home links", () => {
  it("[AC-SET-02.10] each link is named by its title and described by its one-line explanation", () => {
    render(
      <MemoryRouter>
        <HubLink to="/x" icon="gauge" title="Log odometer" description="Add this week's reading" />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Log odometer" });
    expect(link.getAttribute("href")).toBe("/x");
    expect(link.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(link.getAttribute("aria-describedby")!)!.textContent).toBe("Add this week's reading");
  });

  it("[AC-SET-02.10] the Car screen offers its three destinations with descriptions", () => {
    render(
      <MemoryRouter>
        <CarPage />
      </MemoryRouter>,
    );
    for (const name of ["Log odometer", "Mileage stats", "Import history"]) {
      const link = screen.getByRole("link", { name });
      expect(document.getElementById(link.getAttribute("aria-describedby")!)!.textContent!.length).toBeGreaterThan(5);
    }
  });
});
