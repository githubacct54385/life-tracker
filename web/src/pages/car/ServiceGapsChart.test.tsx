import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { MaintenanceRecord, ServiceInterval } from "@life-tracker/shared";
import { ServiceGapsChart } from "./ServiceGapsChart";

afterEach(cleanup);

// Synthetic data only.
const rec = (id: number, date: string, services: string[], odometerMiles: number | null = null): MaintenanceRecord => ({ id, date, services, doneBy: "home", place: null, costCents: null, odometerMiles, note: null });
const OIL = [rec(1, "2026-01-10", ["Oil change"], 40_000), rec(2, "2026-05-10", ["Oil change", "Tires"], 44_800), rec(3, "2026-10-20", ["Oil change"], 50_100)];
const INTERVALS: ServiceInterval[] = [{ id: 1, service: "Oil change", miles: 5000, months: 6 }];

function show(records: MaintenanceRecord[], intervals: ServiceInterval[] = INTERVALS) {
  render(<ServiceGapsChart records={records} intervals={intervals} />);
  return within(screen.getByRole("region", { name: "Gaps between visits" }));
}

describe("service gaps chart", () => {
  it("[AC-MIL-11.1] opens on the service done most recently among those with two visits or more, in miles, with a switch to days", async () => {
    const section = show([...OIL, rec(4, "2026-09-01", ["Brakes"], 49_000), rec(5, "2026-02-01", ["Brakes"], 41_000)]);
    // Oil change was done on Oct 20, Brakes on Sep 1: Oil change opens first.
    expect((section.getByLabelText("Service") as HTMLSelectElement).value).toBe("Oil change");
    expect(section.getAllByRole("option").map((o) => o.textContent)).toEqual(["Oil change", "Brakes", "Tires"]);
    expect((section.getByRole("radio", { name: "Miles" }) as HTMLInputElement).checked).toBe(true);
    expect(section.getByRole("img", { name: /miles between each visit for Oil change/ })).toBeTruthy();
    await userEvent.click(section.getByRole("radio", { name: "Days" }));
    expect(section.getByRole("img", { name: /days between each visit for Oil change/ })).toBeTruthy();
  });

  it("[AC-MIL-11.1] picking another service shows that service's gaps", async () => {
    const section = show([...OIL, rec(4, "2026-09-01", ["Brakes"], 49_000), rec(5, "2026-02-01", ["Brakes"], 41_000)]);
    await userEvent.selectOptions(section.getByLabelText("Service"), "Brakes");
    expect(section.getByRole("img", { name: /for Brakes/ })).toBeTruthy();
    expect(section.getByText(/Average gap:/).textContent).toBe("Average gap: 8,000 miles between two visits.");
  });

  it("[AC-MIL-11.2] says where the interval line is, in the unit shown, and draws none without an interval for that unit", async () => {
    const section = show(OIL);
    expect(section.getByText(/Your interval for Oil change: 5,000 miles \(the dashed line\)/)).toBeTruthy();
    expect(section.getByRole("img").getAttribute("aria-label")).toMatch(/line at your interval of 5,000 miles/);
    await userEvent.click(section.getByRole("radio", { name: "Days" }));
    expect(section.getByText(/Your interval for Oil change: 183 days/)).toBeTruthy();
    cleanup();
    const none = show(OIL, []);
    expect(none.queryByText(/Your interval/)).toBeNull();
    expect(none.getByRole("img").getAttribute("aria-label")).not.toMatch(/interval/);
  });

  it("[AC-MIL-11.3] leaves a gap with no odometer out of the miles view, says how many, and shows it in days", async () => {
    const section = show([rec(1, "2026-01-01", ["Tires"], 1000), rec(2, "2026-03-01", ["Tires"]), rec(3, "2026-06-01", ["Tires"], 3000), rec(4, "2026-09-01", ["Tires"], 5000)], []);
    expect(section.getByText(/2 gaps are left out because a visit has no mileage/)).toBeTruthy();
    expect(within(section.getByRole("table")).getAllByRole("row")).toHaveLength(2); // the header and the one gap that can be shown
    await userEvent.click(section.getByRole("radio", { name: "Days" }));
    expect(section.queryByText(/left out/)).toBeNull();
    expect(within(section.getByRole("table")).getAllByRole("row")).toHaveLength(4);
  });

  it("[AC-MIL-11.3] says 1 gap, in the singular, when only one is left out", () => {
    const section = show([rec(1, "2026-01-01", ["Tires"], 1000), rec(2, "2026-03-01", ["Tires"], 3000), rec(3, "2026-06-01", ["Tires"])], []);
    expect(section.getByText(/1 gap is left out/)).toBeTruthy();
  });

  it("[AC-MIL-11.3] when every gap is left out of miles, says so instead of showing an empty chart", () => {
    const section = show([rec(1, "2026-01-01", ["Tires"]), rec(2, "2026-06-01", ["Tires"])], []);
    expect(section.getByText(/No gap can be shown in miles yet/)).toBeTruthy();
    expect(section.queryByRole("img")).toBeNull();
  });

  it("[AC-MIL-11.4] a type with fewer than two visits says it needs two visits", async () => {
    const section = show(OIL);
    await userEvent.selectOptions(section.getByLabelText("Service"), "Tires");
    expect(section.getByText(/Needs two visits to show a gap\. Tires has one visit so far\./)).toBeTruthy();
    expect(section.queryByRole("img")).toBeNull();
  });

  it("[AC-MIL-11.4] with no services at all it says to log the same service twice, and shows no picker", () => {
    const section = show([]);
    expect(section.getByText("Log the same service twice and the gap between the visits shows here.")).toBeTruthy();
    expect(section.queryByLabelText("Service")).toBeNull();
  });

  it("[AC-MIL-11.5] shows the average gap above the chart as a number, and a table of the gaps, newest first, in the shown unit", async () => {
    const section = show(OIL);
    expect(section.getByText(/Average gap:/).textContent).toBe("Average gap: 5,050 miles between 3 visits.");
    const table = section.getByRole("table", { name: /miles between visits for Oil change, newest first/ });
    const rows = within(table).getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(rows).toEqual(["Oct 20, 2026May 10, 20265,300", "May 10, 2026Jan 10, 20264,800"]);
    await userEvent.click(section.getByRole("radio", { name: "Days" }));
    expect(section.getByText(/Average gap:/).textContent).toBe("Average gap: 142 days between 3 visits.");
  });

  it("[AC-MIL-11.5] says 'two visits' for one gap, and uses the singular for a one-day gap", async () => {
    const section = show([rec(1, "2026-06-01", ["Brakes"], 100), rec(2, "2026-06-02", ["Brakes"], 101)], []);
    expect(section.getByText(/Average gap:/).textContent).toBe("Average gap: 1 mile between two visits.");
    await userEvent.click(section.getByRole("radio", { name: "Days" }));
    expect(section.getByText(/Average gap:/).textContent).toBe("Average gap: 1 day between two visits.");
  });
});
