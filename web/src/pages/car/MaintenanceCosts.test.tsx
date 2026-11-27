import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { MaintenanceRecord, OdometerReadingRecord } from "@life-tracker/shared";
import { ApiProvider } from "../../api/ApiContext";
import { createDemoApi } from "../../demo/demoApi";
import { MaintenanceCosts } from "./MaintenanceCosts";
import { MaintenancePage } from "./MaintenancePage";

afterEach(cleanup);

// Synthetic data only. Today is Thursday 2026-11-26.
const TODAY = "2026-11-26";
const joes = { id: 1, name: "Joe's Garage" };
const acme = { id: 2, name: "Acme Tire" };
const rec = (id: number, date: string, services: string[], costCents: number | null, doneBy: "shop" | "home" = "shop", place: MaintenanceRecord["place"] = null): MaintenanceRecord => ({ id, date, services, doneBy, place, costCents, odometerMiles: null, note: null });
const RECORDS = [
  rec(1, "2025-12-05", ["Oil change"], 8000, "shop", joes),
  rec(2, "2026-03-10", ["Tires"], 60_000, "shop", acme),
  rec(3, "2026-03-20", ["Wipers"], 1800, "home"),
  rec(4, "2026-09-02", ["Oil change", "Air filter"], 9500, "shop", joes),
  rec(5, "2026-10-15", ["Brakes"], null, "shop", joes),
  rec(6, "2026-11-01", ["Oil change"], 4500, "home"),
];
const reading = (id: number, date: string, miles: number): OdometerReadingRecord => ({ id, date, miles });
// Fridays, 300 miles a week.
const READINGS = [reading(4, "2026-11-20", 41_200), reading(3, "2026-11-13", 40_900), reading(2, "2026-11-06", 40_600), reading(1, "2026-10-30", 40_300)];

function show(records: MaintenanceRecord[] = RECORDS, readings: OdometerReadingRecord[] = READINGS) {
  render(<MaintenanceCosts records={records} readings={readings} today={TODAY} />);
  return within(screen.getByRole("region", { name: "Costs" }));
}
const rowsOf = (table: HTMLElement) => within(table).getAllByRole("row").slice(1).map((r) => r.textContent);

describe("Costs", () => {
  it("[AC-MIL-10.1] shows spend per month for the last 12 months as a bar chart with a table, newest first, and the total", () => {
    const section = show();
    expect(section.getByRole("img", { name: /spend per month, 12 bars, \$838\.00 in all/i })).toBeTruthy();
    const table = section.getByRole("table", { name: "Spend per month" });
    const rows = rowsOf(table);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toBe("Nov 2026$45.001");
    expect(rows.at(-1)).toBe("Dec 2025$80.001");
    expect(rows.find((r) => r!.startsWith("Mar 2026"))).toBe("Mar 2026$618.002");
    expect(rows.find((r) => r!.startsWith("Jan 2026"))).toBe("Jan 2026$0.000");
    expect(section.getByText(/Spent in this period:/).textContent).toBe("Spent in this period: $838.00");
  });

  it("[AC-MIL-10.1] switches to spend per year, across every year and not just the period", async () => {
    const section = show();
    await userEvent.click(section.getByRole("radio", { name: "Per year" }));
    expect(section.getByText("Every year, not just this period.")).toBeTruthy();
    expect(rowsOf(section.getByRole("table", { name: "Spend per year" }))).toEqual(["2026$758.004", "2025$80.001"]);
    await userEvent.click(section.getByRole("radio", { name: "Per month" }));
    expect(section.getByRole("table", { name: "Spend per month" })).toBeTruthy();
  });

  it("[AC-MIL-10.2] splits the spend by place, biggest first, with Done at home as its own bar", () => {
    const section = show();
    expect(rowsOf(section.getByRole("table", { name: "Spend by place" }))).toEqual(["Acme Tire$600.001", "Joe's Garage$175.002", "Done at home$63.002"]);
    expect(section.getByRole("img", { name: /spend by place, 3 bars/i })).toBeTruthy();
  });

  it("[AC-MIL-10.3] splits the spend by kind of service, and a service with several types is 'Several services', never split", () => {
    const section = show();
    expect(rowsOf(section.getByRole("table", { name: "Spend by kind of service" }))).toEqual(["Tires$600.001", "Oil change$125.002", "Several services$95.001", "Wipers$18.001"]);
  });

  it("[AC-MIL-10.4] shows the cost per mile for the period, from the weekly readings", () => {
    const section = show([rec(1, "2026-11-02", ["Oil change"], 9000)]);
    // Three weekly periods of 300 miles = 900 miles, and $90.00 spent: 10 cents a mile.
    expect(section.getByText(/Cost per mile:/).textContent).toBe("Cost per mile: $0.10 ($90.00 over 900 miles driven)");
  });

  it("[AC-MIL-10.4] says not enough data when the period has fewer than two odometer readings", async () => {
    const section = show();
    await userEvent.selectOptions(section.getByLabelText("Period"), "2025");
    expect(section.getByText(/Cost per mile:/).textContent).toBe("Cost per mile: not enough data (needs at least two odometer readings in this period)");
    cleanup();
    expect(show(RECORDS, [reading(1, "2026-11-20", 41_200)]).getByText(/Cost per mile:/).textContent).toMatch(/not enough data/);
  });

  it("[AC-MIL-10.4] changing the period changes the totals, the splits and the cost per mile together", async () => {
    const section = show();
    await userEvent.selectOptions(section.getByLabelText("Period"), "2025");
    expect(section.getByText(/Spent in this period:/).textContent).toBe("Spent in this period: $80.00");
    expect(rowsOf(section.getByRole("table", { name: "Spend by place" }))).toEqual(["Joe's Garage$80.001"]);
    expect(section.getAllByRole("option").map((o) => o.textContent)).toEqual(["Last 12 months", "All time", "2026", "2025"]);
    await userEvent.selectOptions(section.getByLabelText("Period"), "all");
    expect(section.getByText(/Spent in this period:/).textContent).toBe("Spent in this period: $838.00");
  });

  it("[AC-MIL-10.5] counts the services with no cost and leaves them out of the totals", async () => {
    const section = show();
    expect(section.getByText("1 service has no cost and is left out of these totals.")).toBeTruthy();
    cleanup();
    const two = show([...RECORDS, rec(7, "2026-11-10", ["Brakes"], null, "home")]);
    expect(two.getByText("2 services have no cost and are left out of these totals.")).toBeTruthy();
    cleanup();
    expect(show([rec(1, "2026-11-01", ["Oil change"], 4500)]).queryByText(/no cost/)).toBeNull();
  });

  it("[AC-MIL-10.6] every chart has a table that can be opened, and no bar depends on colour: each is named in its table and on its axis", () => {
    const section = show();
    expect(section.getAllByText("Show the numbers as a table")).toHaveLength(3);
    expect(section.getAllByRole("table")).toHaveLength(3);
    expect(section.getAllByRole("img")).toHaveLength(3);
  });

  it("[AC-MIL-10.7] with no services logged, says so briefly instead of showing empty charts", () => {
    const section = show([]);
    expect(section.getByText("No services logged yet. Log a service with its cost and the charts show here.")).toBeTruthy();
    expect(section.queryByRole("img")).toBeNull();
    expect(section.queryByLabelText("Period")).toBeNull();
  });

  it("[AC-MIL-10.7] services with no cost at all say so for each chart, with no empty axes", () => {
    const section = show([rec(1, "2026-11-01", ["Oil change"], null)]);
    expect(section.getAllByText("No costs logged in this period.")).toHaveLength(3);
    expect(section.queryByRole("img")).toBeNull();
    expect(section.getByText("1 service has no cost and is left out of these totals.")).toBeTruthy();
  });

  it("[AC-MIL-10.7] the demo's sample services draw the charts on the Maintenance page", async () => {
    render(
      <MemoryRouter>
        <ApiProvider api={createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) })}>
          <MaintenancePage today="2026-11-13" />
        </ApiProvider>
      </MemoryRouter>,
    );
    const section = within(await screen.findByRole("region", { name: "Costs" }));
    expect(section.getAllByRole("img").length).toBe(3);
    expect(section.getByText(/Spent in this period:/).textContent).toBe("Spent in this period: $107.99");
  });
});
