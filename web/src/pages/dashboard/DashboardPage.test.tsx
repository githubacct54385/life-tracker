import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import type { Api } from "../../api/types";
import { createDemoApi } from "../../demo/demoApi";
import { DashboardPage } from "./DashboardPage";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

// Synthetic data only. The demo has weights from Nov 4 to Nov 17 (the newest 173.6 lb), odometer readings every Friday up to
// Nov 6 (48,402, after 48,190), three workouts on Nov 3, 5 and 6 (117 min), and regular gifts and two special contributions.
function open(api: Api = createDemoApi(), today = "2026-11-18") {
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <DashboardPage today={today} />
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}
const tile = (name: string) => screen.findByRole("region", { name });

describe("Dashboard", () => {
  it("[AC-DSH-01.1] shows the latest weight with its trend and how it moved over the last week", async () => {
    open();
    const weight = await tile("Weight");
    expect(await within(weight).findByText("173.6 lb")).toBeTruthy();
    expect(within(weight).getByText(/7-day trend 174\.2 lb\. Down 1\.3 lb over the last week\./)).toBeTruthy();
  });

  it("[AC-DSH-01.1] shows the weight in kilograms when the setting says so", async () => {
    localStorage.setItem("life-tracker.preferences", JSON.stringify({ theme: "system", timeZone: "UTC", weightUnit: "kg" }));
    open();
    expect(await within(await tile("Weight")).findByText("78.7 kg")).toBeTruthy();
  });

  it("[AC-DSH-01.1] shows last week's miles, with the week it ended", async () => {
    open();
    const miles = await tile("Last week's miles");
    expect(await within(miles).findByText("212 miles")).toBeTruthy(); // 48,402 - 48,190
    expect(within(miles).getByText("Week ending Nov 6")).toBeTruthy();
  });

  it("[AC-DSH-01.1] shows the workouts in the current week, weeks starting Monday", async () => {
    open(createDemoApi(), "2026-11-06");
    const workouts = await tile("Workouts this week");
    expect(await within(workouts).findByText("3 workouts")).toBeTruthy();
    expect(within(workouts).getByText("1 h 57 min in total")).toBeTruthy();
    cleanup();
    open(createDemoApi(), "2026-11-09"); // the next Monday starts a new week
    expect(await within(await tile("Workouts this week")).findByText("No workouts yet this week.")).toBeTruthy();
  });

  it("[AC-DSH-01.1] shows year-to-date giving: combined, with regular and special", async () => {
    open();
    const giving = await tile("Giving this year");
    expect(await within(giving).findByText("$850.00")).toBeTruthy();
    expect(within(giving).getByText("Year to date: $500.00 regular, $350.00 special")).toBeTruthy();
  });

  it("[AC-DSH-01.1] each tile says what to do when there is nothing yet", async () => {
    const api = createDemoApi();
    for (const e of (await api.listWeights()).entries) await api.deleteWeight(e.id);
    for (const r of (await api.listAllReadings()).readings.slice(1)) await api.deleteReading(r.id);
    for (const w of (await api.listWorkouts()).workouts) await api.deleteWorkout(w.id);
    open(api);
    expect(await within(await tile("Weight")).findByText(/No weights yet\. Add today/)).toBeTruthy();
    expect(await within(await tile("Last week's miles")).findByText(/Needs two weekly readings/)).toBeTruthy();
    expect(await within(await tile("Workouts this week")).findByText("No workouts yet this week.")).toBeTruthy();
  });

  it("[AC-DSH-01.1] one tile failing does not stop the others", async () => {
    const api = createDemoApi();
    api.listWeights = async () => {
      throw new Error("down");
    };
    open(api);
    expect(await within(await tile("Weight")).findByText(/Could not load this/)).toBeTruthy();
    expect(await within(await tile("Giving this year")).findByText("$850.00")).toBeTruthy();
  });

  it("[AC-DSH-01.2] shows the odometer-due banner when this week has no reading", async () => {
    open(createDemoApi(), "2026-11-13"); // Friday: a new week, and the last reading was on Nov 6
    const banner = await screen.findByRole("status");
    expect(banner.textContent).toContain("Your odometer reading for this week is due.");
    expect(within(banner).getByRole("link", { name: "Log odometer" }).getAttribute("href")).toBe("/car/log");
  });

  it("[AC-DSH-01.2] shows no banner when this week's reading is there, and none while the readings are loading or failed", async () => {
    open(createDemoApi(), "2026-11-10"); // Tuesday of the week that began with the Nov 6 reading
    await tile("Last week's miles");
    await within(await tile("Last week's miles")).findByText("212 miles");
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    const api = createDemoApi();
    api.listAllReadings = async () => {
      throw new Error("down");
    };
    open(api, "2026-11-13");
    await within(await tile("Last week's miles")).findByText(/Could not load this/);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("[AC-DSH-01.2] the banner goes away once this week's reading is logged", async () => {
    const api = createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0) });
    open(api, "2026-11-13");
    expect(await screen.findByRole("status")).toBeTruthy();
    cleanup();
    await api.logReading(48_610);
    open(api, "2026-11-13");
    await within(await tile("Last week's miles")).findByText("208 miles");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("[AC-DSH-01.3] offers quick actions to add weight, add a workout, log the odometer and add giving", async () => {
    open();
    const actions = await screen.findByRole("region", { name: "Quick actions" });
    const links = within(actions).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["Add weight", "/health/weight"],
      ["Add workout", "/health/workouts"],
      ["Log odometer", "/car/log"],
      ["Add giving", "/giving/log"],
    ]);
  });

  it("[AC-DSH-01.4] lays the tiles and the actions out in one column by default and two columns from tablet width", async () => {
    open();
    const weight = await tile("Weight");
    const grid = weight.parentElement!;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("sm:grid-cols-2");
    const actions = (await screen.findByRole("region", { name: "Quick actions" })).querySelector("div")!;
    expect(actions.className).toContain("grid-cols-1");
    expect(actions.className).toContain("sm:grid-cols-2");
  });
});
