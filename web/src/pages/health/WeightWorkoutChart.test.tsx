import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WeightEntryRecord, WorkoutRecord } from "@life-tracker/shared";
import { ApiProvider } from "../../api/ApiContext";
import { createDemoApi } from "../../demo/demoApi";
import { HealthPage } from "./HealthPage";
import { WeightWorkoutChart } from "./WeightWorkoutChart";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

// Synthetic data. Today is Thursday 2026-11-26, so the current week runs Friday Nov 20 to Thursday Nov 26.
const TODAY = "2026-11-26";
const weight = (id: number, date: string, pounds: number): WeightEntryRecord => ({ id, date, pounds });
const workout = (id: number, date: string, minutes: number | null, type = "Run"): WorkoutRecord => ({ id, date, type, minutes, reps: minutes === null ? 40 : null, note: null, source: "manual" });
// A reading in each of five weeks (Nov 22, Nov 15, Nov 8, Nov 1, Oct 25).
const FIVE_WEEKS = [weight(5, "2026-11-22", 170), weight(4, "2026-11-15", 171), weight(3, "2026-11-08", 172), weight(2, "2026-11-01", 173), weight(1, "2026-10-25", 174)];

function show(weights: WeightEntryRecord[], workouts: WorkoutRecord[] = []) {
  render(<WeightWorkoutChart weights={weights} workouts={workouts} today={TODAY} />);
  return within(screen.getByRole("region", { name: "Weight and workouts" }));
}

describe("weight and workouts chart", () => {
  it("[AC-HLT-06.1] shows one chart of weight and workout minutes, opening on 6 months, with 3 months and 1 year to choose", async () => {
    const section = show(FIVE_WEEKS, [workout(1, "2026-11-23", 30)]);
    expect(section.getByRole("img", { name: /weight and workout minutes over the last 6 months/ })).toBeTruthy();
    expect((section.getByRole("radio", { name: "6 months" }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(section.getByRole("radio", { name: "3 months" }));
    expect(section.getByRole("img", { name: /over the last 3 months/ })).toBeTruthy();
    await userEvent.click(section.getByRole("radio", { name: "1 year" }));
    expect(section.getByRole("img", { name: /over the last 1 year/ })).toBeTruthy();
    expect(section.getAllByRole("radio")).toHaveLength(3);
  });

  it("[AC-HLT-06.1][AC-HLT-06.5] has a table of the weeks, newest first, in the owner's unit, and its size follows the range", async () => {
    const section = show(FIVE_WEEKS, [workout(1, "2026-11-23", 30), workout(2, "2026-11-23", 20, "Swim")]);
    const table = section.getByRole("table", { name: /over the last 6 months, newest first.*Friday to Thursday/ });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(1 + 26);
    expect(rows[1]!.textContent).toBe("Nov 20 (this week)170.050");
    expect(rows[2]!.textContent).toBe("Nov 13171.0–");
    await userEvent.click(section.getByRole("radio", { name: "3 months" }));
    expect(section.getAllByRole("row")).toHaveLength(1 + 13);
  });

  it("[AC-HLT-06.2] a week with no weight reading shows a dash in the table, not a zero, and a week with no workouts shows no minutes", () => {
    const section = show(FIVE_WEEKS.filter((w) => w.id !== 4), [workout(1, "2026-11-10", 45)]);
    const rows = within(section.getByRole("table")).getAllByRole("row").map((r) => r.textContent);
    // Week of Nov 13 has no reading and no workout; week of Nov 6 has a workout (Tue Nov 10 is in the week starting Fri Nov 6).
    expect(rows.find((r) => r!.startsWith("Nov 13"))).toBe("Nov 13––");
    expect(rows.find((r) => r!.startsWith("Nov 6"))).toBe("Nov 6172.045");
    expect(within(section.getByRole("table")).getAllByLabelText("No weight logged").length).toBeGreaterThan(0);
    expect(rows.some((r) => /\b0\.0\b/.test(r ?? ""))).toBe(false);
  });

  it("[AC-HLT-06.3] says what each scale is, in the owner's weight unit and in minutes, and that nothing links the two", () => {
    const section = show(FIVE_WEEKS, [workout(1, "2026-11-23", 30)]);
    expect(section.getByRole("columnheader", { name: "Weight, 7-day average (lb)" })).toBeTruthy();
    expect(section.getByRole("columnheader", { name: "Minutes" })).toBeTruthy();
    expect(section.getByText(/separate scales.*No line joins the two/)).toBeTruthy();
    expect(section.getByRole("img").getAttribute("aria-label")).toMatch(/in lb.*minutes worked out.*two scales are separate/);
  });

  it("[AC-HLT-06.3] shows the weight in kilograms when that is the owner's unit", () => {
    localStorage.setItem("life-tracker.preferences", JSON.stringify({ weightUnit: "kg" }));
    const section = show(FIVE_WEEKS);
    expect(section.getByRole("columnheader", { name: "Weight, 7-day average (kg)" })).toBeTruthy();
    expect(within(section.getByRole("table")).getAllByRole("row")[1]!.textContent).toContain("77.1");
  });

  it("[AC-HLT-06.4] with weights in fewer than four weeks it says there is not enough data yet, and says how many weeks it has", () => {
    const section = show(FIVE_WEEKS.slice(0, 3), [workout(1, "2026-11-23", 30)]);
    expect(section.getByText(/Not enough weight data yet.*at least 4 different weeks.*you have 3 in the last 6 months/)).toBeTruthy();
    expect(section.queryByRole("img")).toBeNull();
    // The table is still there for what there is.
    expect(section.getByRole("table")).toBeTruthy();
  });

  it("[AC-HLT-06.4] with no weights at all it says so, and the choice of range still works", async () => {
    const section = show([]);
    expect(section.getByText(/you have 0 in the last 6 months/)).toBeTruthy();
    await userEvent.click(section.getByRole("radio", { name: "1 year" }));
    expect(section.getByText(/you have 0 in the last 1 year/)).toBeTruthy();
  });
});

describe("weight and workouts chart on the Health screen", () => {
  it("[AC-HLT-06.1] is on the Health page under the weekly workout chart, and loads on its own", async () => {
    render(
      <MemoryRouter>
        <ApiProvider api={createDemoApi()}>
          <HealthPage today="2026-11-09" />
        </ApiProvider>
      </MemoryRouter>,
    );
    const weekly = await screen.findByRole("region", { name: "Weekly workouts" });
    const together = await screen.findByRole("region", { name: "Weight and workouts" });
    // Document order: the weekly chart comes first.
    expect(weekly.compareDocumentPosition(together) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("[AC-HLT-06.1] the demo API supplies its synthetic weights and workouts, so the chart has a table in demo mode", async () => {
    render(
      <MemoryRouter>
        <ApiProvider api={createDemoApi()}>
          <HealthPage today="2026-11-09" />
        </ApiProvider>
      </MemoryRouter>,
    );
    const section = within(await screen.findByRole("region", { name: "Weight and workouts" }));
    expect(section.getByRole("table")).toBeTruthy();
  });
});
