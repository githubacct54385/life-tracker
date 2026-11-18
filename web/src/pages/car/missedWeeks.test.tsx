import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import type { Api } from "../../api/types";
import { createDemoApi } from "../../demo/demoApi";
import { LogOdometerPage, pastGapWeeks } from "./LogOdometerPage";
import { MileageStatsPage } from "./MileageStatsPage";

afterEach(cleanup);

// Invented readings. Weeks run Friday to Thursday. Fridays: Oct 9, Oct 16, Oct 23, Oct 30, Nov 6.
const reading = (id: number, date: string, miles: number) => ({ id, date, miles });
function apiWith(readings: ReturnType<typeof reading>[]): Api {
  const api = createDemoApi();
  const newest = [...readings].sort((a, b) => (a.date < b.date ? 1 : -1));
  api.listReadings = async () => ({ readings: newest });
  api.listAllReadings = async () => ({ readings: newest });
  return api;
}

describe("pastGapWeeks", () => {
  it("[AC-MIL-02.6] lists a past week with no reading, and not the current week", () => {
    const readings = [reading(3, "2026-10-30", 1210), reading(2, "2026-10-16", 1000), reading(1, "2026-10-09", 800)];
    expect(pastGapWeeks(readings, "2026-11-04")).toEqual(["2026-10-23"]); // Oct 23 is a gap; Oct 30's week has its reading
    expect(pastGapWeeks(readings, "2026-11-06")).toEqual(["2026-10-23"]); // Nov 6 starts a week with no reading yet: not a gap
  });

  it("[AC-MIL-02.6] a week becomes a gap once it is over, and an old gap stays a gap", () => {
    const readings = [reading(2, "2026-10-30", 1210), reading(1, "2026-10-23", 1000)];
    expect(pastGapWeeks(readings, "2026-11-05")).toEqual([]); // Thursday: the week that began Oct 30 is covered
    expect(pastGapWeeks(readings, "2026-11-13")).toEqual(["2026-11-06"]); // the week of Nov 6 ended without a reading
    expect(pastGapWeeks(readings, "2026-11-20")).toEqual(["2026-11-06", "2026-11-13"]);
  });

  it("[AC-MIL-02.6] does not invent gaps before the first reading, and has none with no readings", () => {
    expect(pastGapWeeks([], "2026-11-06")).toEqual([]);
    expect(pastGapWeeks([reading(1, "2026-10-30", 1000)], "2026-11-06")).toEqual([]);
  });

  it("[AC-MIL-02.5] a reading on Saturday counts for its week, so that week is not a gap", () => {
    const readings = [reading(2, "2026-10-31", 1100), reading(1, "2026-10-23", 900)];
    expect(pastGapWeeks(readings, "2026-11-04")).toEqual([]);
  });
});

describe("Log odometer screen: gaps", () => {
  function open(readings: ReturnType<typeof reading>[], today: string) {
    render(
      <MemoryRouter>
        <ApiProvider api={apiWith(readings)}>
          <LogOdometerPage today={today} />
        </ApiProvider>
      </MemoryRouter>,
    );
  }

  it("[AC-MIL-02.6] shows a missed week as 'no reading' between the readings around it, newest first, with no buttons", async () => {
    open([reading(3, "2026-10-30", 1210), reading(2, "2026-10-16", 1000), reading(1, "2026-10-09", 800)], "2026-11-04");
    const gap = await screen.findByRole("listitem", { name: "No reading for the week of Oct 23" });
    expect(gap.textContent).toBe("Week of Oct 23: no reading");
    expect(within(gap).queryByRole("button")).toBeNull();
    const rows = within(gap.parentElement!).getAllByRole("listitem").map((li) => li.getAttribute("aria-label") ?? li.textContent?.slice(0, 6));
    expect(rows[0]).toContain("Oct 30");
    expect(rows[1]).toBe("No reading for the week of Oct 23");
    expect(rows[2]).toContain("Oct 16");
  });

  it("[AC-MIL-02.6] shows no gap when every week has a reading, and none for the week still to enter", async () => {
    open([reading(2, "2026-10-30", 1210), reading(1, "2026-10-23", 1000)], "2026-11-06");
    await screen.findByText("Oct 30");
    expect(screen.queryByText(/no reading/)).toBeNull();
  });
});

describe("Mileage stats screen: gaps", () => {
  it("[AC-MIL-02.6] says a period covers weeks with no reading, and never fills them in", async () => {
    render(
      <MemoryRouter>
        <ApiProvider api={apiWith([reading(3, "2026-10-30", 1210), reading(2, "2026-10-16", 1000), reading(1, "2026-10-09", 800)])}>
          <MileageStatsPage />
        </ApiProvider>
      </MemoryRouter>,
    );
    const table = await screen.findByRole("table", { name: /Miles per period/ });
    const rows = within(table).getAllByRole("row");
    // Newest first: Oct 30 covers Oct 16 to Oct 30 (14 days, one missed week, 210 miles); Oct 16 covers Oct 9 to Oct 16 (200 miles).
    expect(rows[1]!.textContent).toContain("Oct 30 (14 days)");
    expect(rows[1]!.textContent).toContain("1 week with no reading");
    expect(rows[1]!.textContent).toContain("210");
    expect(rows[2]!.textContent).not.toContain("no reading");
    expect(rows[2]!.textContent).toContain("200");
  });
});
