import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { MaintenanceRecord } from "./maintenance.js";
import { gapServices, intervalLine, serviceGaps } from "./serviceGaps.js";

const rec = (id: number, date: string, services: string[], odometerMiles: number | null = null): MaintenanceRecord => ({ id, date, services, doneBy: "home", place: null, costCents: null, odometerMiles, note: null });
const OIL = [rec(1, "2026-01-10", ["Oil change"], 40_000), rec(2, "2026-05-10", ["oil change", "Tires"], 44_800), rec(3, "2026-10-20", ["Oil Change"], 50_100)];

describe("serviceGaps", () => {
  it("[AC-MIL-11.1] gives the gap between each visit and the one before it, in miles and in days, oldest first, matching the type ignoring letter case", () => {
    const miles = serviceGaps(OIL, "Oil change", "miles");
    expect(miles.visits).toBe(3);
    expect(miles.gaps).toEqual([
      { from: "2026-01-10", to: "2026-05-10", days: 120, miles: 4800 },
      { from: "2026-05-10", to: "2026-10-20", days: 163, miles: 5300 },
    ]);
    expect(serviceGaps(OIL, "OIL CHANGE", "days").gaps.map((g) => g.days)).toEqual([120, 163]);
  });

  it("[AC-MIL-11.1] puts visits in date order whatever order the records come in, and the higher id later on one day", () => {
    const shuffled = [OIL[2]!, OIL[0]!, OIL[1]!];
    expect(serviceGaps(shuffled, "Oil change", "days").gaps.map((g) => g.to)).toEqual(["2026-05-10", "2026-10-20"]);
    const sameDay = [rec(5, "2026-06-01", ["Brakes"], 100), rec(4, "2026-06-01", ["Brakes"], 90), rec(6, "2026-06-03", ["Brakes"], 130)];
    expect(serviceGaps(sameDay, "Brakes", "miles").gaps).toEqual([
      { from: "2026-06-01", to: "2026-06-01", days: 0, miles: 10 },
      { from: "2026-06-01", to: "2026-06-03", days: 2, miles: 30 },
    ]);
  });

  it("[AC-MIL-11.3] leaves a gap out of the miles view when either visit has no odometer, and counts how many were left out", () => {
    const records = [rec(1, "2026-01-01", ["Tires"], 1000), rec(2, "2026-03-01", ["Tires"]), rec(3, "2026-06-01", ["Tires"], 3000), rec(4, "2026-09-01", ["Tires"], 5000)];
    const miles = serviceGaps(records, "Tires", "miles");
    expect(miles.gaps).toEqual([{ from: "2026-06-01", to: "2026-09-01", days: 92, miles: 2000 }]);
    expect(miles.leftOut).toBe(2);
    // The days view needs no odometer, so nothing is left out.
    const days = serviceGaps(records, "Tires", "days");
    expect(days.gaps).toHaveLength(3);
    expect(days.leftOut).toBe(0);
  });

  it("[AC-MIL-11.3] a later visit with a lower odometer (a typing slip) is left out, never shown as a negative or guessed", () => {
    const records = [rec(1, "2026-01-01", ["Brakes"], 5000), rec(2, "2026-06-01", ["Brakes"], 4000)];
    expect(serviceGaps(records, "Brakes", "miles")).toMatchObject({ gaps: [], leftOut: 1, average: null });
  });

  it("[AC-MIL-11.4] fewer than two visits gives no gaps, so the page can say it needs two", () => {
    expect(serviceGaps(OIL, "Tires", "miles")).toMatchObject({ visits: 1, gaps: [], leftOut: 0, average: null });
    expect(serviceGaps(OIL, "Wipers", "days")).toMatchObject({ visits: 0, gaps: [], average: null });
    expect(serviceGaps([], "Oil change", "miles")).toMatchObject({ visits: 0, gaps: [] });
  });

  it("[AC-MIL-11.5] the average is the mean of the gaps shown in the chosen unit, as a whole number", () => {
    expect(serviceGaps(OIL, "Oil change", "miles").average).toBe(5050);
    expect(serviceGaps(OIL, "Oil change", "days").average).toBe(142); // (120 + 163) / 2 = 141.5
    // Only the shown gaps count: the one without an odometer is not part of the miles average.
    const records = [rec(1, "2026-01-01", ["X"], 0), rec(2, "2026-02-01", ["X"]), rec(3, "2026-03-01", ["X"], 400), rec(4, "2026-04-01", ["X"], 1000)];
    expect(serviceGaps(records, "X", "miles").average).toBe(600);
  });

  it("[AC-MIL-11.1] never has a negative gap, the shown plus left out always add up to the gaps there are, and the days add up to the span", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ day: fc.integer({ min: 0, max: 900 }), odo: fc.option(fc.integer({ min: 0, max: 300_000 }), { nil: null }) }), { maxLength: 12 }), (rows) => {
        const records = rows.map((r, i) => rec(i + 1, new Date(Date.parse("2025-01-01T00:00:00Z") + r.day * 86_400_000).toISOString().slice(0, 10), ["Oil change"], r.odo));
        const days = serviceGaps(records, "Oil change", "days");
        const miles = serviceGaps(records, "Oil change", "miles");
        const span = records.length < 2 ? 0 : Math.max(...rows.map((r) => r.day)) - Math.min(...rows.map((r) => r.day));
        return days.gaps.every((g) => g.days >= 0) && miles.gaps.every((g) => g.miles! >= 0) && miles.gaps.length + miles.leftOut === days.gaps.length && days.gaps.reduce((s, g) => s + g.days, 0) === span;
      }),
    );
  });
});

describe("gapServices", () => {
  it("[AC-MIL-11.4] lists the types with two visits or more first, the one done most recently first, then the rest, one spelling each", () => {
    const records = [...OIL, rec(4, "2026-09-01", ["Brakes"]), rec(5, "2026-02-01", ["brakes"]), rec(6, "2026-11-01", ["Wipers"]), rec(7, "2026-04-01", ["Alignment"])];
    expect(gapServices(records)).toEqual(["Oil Change", "Brakes", "Wipers", "Tires", "Alignment"]);
    expect(gapServices([])).toEqual([]);
  });
});

describe("intervalLine", () => {
  const intervals = [{ id: 1, service: "Oil change", miles: 5000, months: 6 }, { id: 2, service: "Tires", miles: 40_000, months: null }, { id: 3, service: "Wipers", miles: null, months: 12 }];

  it("[AC-MIL-11.2] gives the interval in the unit shown, matching the type ignoring letter case", () => {
    expect(intervalLine(intervals, "oil CHANGE", "miles")).toBe(5000);
    expect(intervalLine(intervals, "Oil change", "days")).toBe(183);
    expect(intervalLine(intervals, "Wipers", "days")).toBe(365);
  });

  it("[AC-MIL-11.2] gives nothing, so no line is drawn, without an interval for that type or for that unit", () => {
    expect(intervalLine(intervals, "Brakes", "miles")).toBeNull();
    expect(intervalLine(intervals, "Tires", "days")).toBeNull();
    expect(intervalLine(intervals, "Wipers", "miles")).toBeNull();
    expect(intervalLine([], "Oil change", "miles")).toBeNull();
  });
});
