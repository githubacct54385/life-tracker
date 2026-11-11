import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { weeklyMiles } from "@life-tracker/shared";
import { ApiProvider } from "../../api/ApiContext";
import type { Api } from "../../api/types";
import { createDemoApi } from "../../demo/demoApi";
import { MileageStatsPage } from "./MileageStatsPage";

afterEach(cleanup);

async function open(api: Api = createDemoApi()) {
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <MileageStatsPage />
      </ApiProvider>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Miles per week" }).catch(() => undefined);
}

// jsdom has no layout, so the chart itself draws nothing here. The numbers it would draw are in the text alternative,
// and the real drawing at three widths is checked in the layout end-to-end test.
describe("Mileage stats screen", () => {
  it("[AC-MIL-03.1] lists each period's actual miles, with a 14-day period shown as it is and not scaled", async () => {
    const { readings } = await createDemoApi().listAllReadings();
    const periods = weeklyMiles(readings);
    const long = periods.find((p) => p.days === 14);
    expect(long).toBeDefined(); // the demo history has one missed week
    await open();
    const table = screen.getByRole("table", { name: "Miles per period between weekly readings" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(periods.length);
    const row = rows.find((r) => within(r).queryByText(/\(14 days\)/));
    expect(row).toBeDefined();
    expect(within(row!).getByText(long!.miles.toLocaleString("en-US"))).toBeTruthy();
  });

  it("[AC-MIL-03.2] shows the rolling 8-week average, monthly totals and yearly totals", async () => {
    await open();
    expect(screen.getByRole("heading", { name: "Rolling 8-week average" }).parentElement?.textContent).toMatch(/\d[\d,]* miles a week/);
    const months = within(screen.getByRole("heading", { name: "Monthly totals" }).parentElement!).getAllByRole("listitem");
    expect(months.length).toBeGreaterThan(2);
    expect(months[0]!.textContent).toMatch(/Nov 2026/); // newest first
    const years = within(screen.getByRole("heading", { name: "Yearly totals" }).parentElement!).getAllByRole("listitem");
    expect(years).toHaveLength(1); // the demo history is all in 2026; several years are covered in shared/src/mileageStats.test.ts
    expect(years[0]!.textContent).toMatch(/^2026.*miles$/);
  });

  it("[AC-MIL-03.3] names the busiest and quietest weeks", async () => {
    const { readings } = await createDemoApi().listAllReadings();
    const weekly = weeklyMiles(readings).filter((p) => p.days <= 8).map((p) => p.miles);
    await open();
    const block = screen.getByRole("heading", { name: "Busiest and quietest weeks" }).parentElement!;
    expect(within(block).getByText("Busiest").nextElementSibling?.textContent).toContain(Math.max(...weekly).toLocaleString("en-US"));
    expect(within(block).getByText("Quietest").nextElementSibling?.textContent).toContain(Math.min(...weekly).toLocaleString("en-US"));
  });

  it("[AC-MIL-03.4] the chart has a text alternative and the numbers are available as a table", async () => {
    await open();
    expect(screen.getByRole("img", { name: /Bar chart of miles driven/ })).toBeTruthy();
    expect(screen.getByText("Show the numbers as a table")).toBeTruthy();
  });

  it("[AC-MIL-03.2] with fewer than two weekly readings it says stats need more readings instead of drawing an empty chart", async () => {
    const api: Api = { ...createDemoApi(), listAllReadings: async () => ({ readings: [{ id: 1, date: "2026-11-06", miles: 1000 }] }) };
    await open(api);
    expect(await screen.findByText(/Stats appear once you have two weekly readings/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows a message, not a blank page, when the readings cannot be loaded", async () => {
    const api: Api = { ...createDemoApi(), listAllReadings: async () => Promise.reject(new Error("offline")) };
    await open(api);
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not be loaded/);
  });
});
