import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { missingWeeks, weeklyMiles, type OdometerReading } from "./mileage";

// All dates and values are invented. 2026-01-02 is a Friday.
const r = (date: string, miles: number): OdometerReading => ({ date, miles });

describe("weeklyMiles", () => {
  it("[AC-MIL-02.1] a week runs Friday to Thursday and its miles are the difference between consecutive weekly readings", () => {
    expect(weeklyMiles([r("2026-01-02", 1000), r("2026-01-09", 1120), r("2026-01-16", 1150)])).toEqual([
      { from: "2026-01-02", to: "2026-01-09", days: 7, miles: 120, weekStart: "2026-01-09", missedWeeks: 0 },
      { from: "2026-01-09", to: "2026-01-16", days: 7, miles: 30, weekStart: "2026-01-16", missedWeeks: 0 },
    ]);
  });

  it("[AC-MIL-02.5] a reading taken on Saturday counts for the Friday's week, and that period is 8 days", () => {
    const periods = weeklyMiles([r("2026-01-02", 1000), r("2026-01-10", 1130), r("2026-01-16", 1200)]);
    expect(periods).toEqual([
      { from: "2026-01-02", to: "2026-01-10", days: 8, miles: 130, weekStart: "2026-01-09", missedWeeks: 0 },
      { from: "2026-01-10", to: "2026-01-16", days: 6, miles: 70, weekStart: "2026-01-16", missedWeeks: 0 }, // next week's Friday is on time again
    ]);
  });

  it("[AC-MIL-02.5] a reading on any day Friday to Thursday counts for that week, and only the earliest one is used", () => {
    // Thursday 01-15 is still the week that began Friday 01-09, so it is not a second check-in.
    const periods = weeklyMiles([r("2026-01-02", 100), r("2026-01-15", 300), r("2026-01-09", 200), r("2026-01-16", 400)]);
    expect(periods.map((p) => [p.to, p.miles])).toEqual([["2026-01-09", 100], ["2026-01-16", 200]]);
    const twoInOneWeek = weeklyMiles([r("2026-01-02", 100), r("2026-01-09", 200), r("2026-01-13", 240)]);
    expect(twoInOneWeek).toHaveLength(1); // the Tuesday reading is the same week as the Friday one and is not a second check-in
    expect(twoInOneWeek[0]!.to).toBe("2026-01-09");
  });

  it("[AC-MIL-02.6] a week with no reading is not filled in: the next period just covers the longer gap", () => {
    const periods = weeklyMiles([r("2026-01-02", 1000), r("2026-01-16", 1210)]);
    expect(periods).toEqual([{ from: "2026-01-02", to: "2026-01-16", days: 14, miles: 210, weekStart: "2026-01-16", missedWeeks: 1 }]);
  });

  it("[AC-MIL-02.6] fewer than two weekly readings gives no periods", () => {
    expect(weeklyMiles([])).toEqual([]);
    expect(weeklyMiles([r("2026-01-02", 1000)])).toEqual([]);
    expect(weeklyMiles([r("2026-01-02", 1000), r("2026-01-05", 1010)])).toEqual([]); // same week
  });

  it("[AC-MIL-02.4] two readings on one date keep the higher value, whatever order they were entered in", () => {
    const a = weeklyMiles([r("2026-01-02", 100), r("2026-01-02", 90), r("2026-01-09", 200)]);
    const b = weeklyMiles([r("2026-01-09", 200), r("2026-01-02", 90), r("2026-01-02", 100)]);
    expect(a).toEqual(b);
    expect(a[0]!.miles).toBe(100);
  });

  it("[AC-MIL-02.4] adding a late reading recalculates only the affected periods; editing or deleting works the same way", () => {
    const withGap = [r("2026-01-02", 1000), r("2026-01-16", 1300)];
    expect(weeklyMiles(withGap).map((p) => [p.days, p.miles])).toEqual([[14, 300]]);
    const filled = weeklyMiles([...withGap, r("2026-01-10", 1150)]); // added a day late
    expect(filled.map((p) => [p.days, p.miles])).toEqual([[8, 150], [6, 150]]);
    const edited = weeklyMiles([r("2026-01-02", 1000), r("2026-01-10", 1100), r("2026-01-16", 1300)]);
    expect(edited.map((p) => p.miles)).toEqual([100, 200]);
    expect(weeklyMiles(withGap.slice(0, 1))).toEqual([]);
  });

  it("[AC-MIL-02.1] rejects dates that are not real calendar dates", () => {
    expect(() => weeklyMiles([r("2026-02-30", 1)])).toThrow(/date/i);
    expect(() => weeklyMiles([r("01/02/2026", 1)])).toThrow(/date/i);
  });
});

describe("missingWeeks", () => {
  it("[AC-MIL-02.6] lists each Friday that starts a week with no reading, up to the week of today", () => {
    const readings = [r("2026-01-02", 1000), r("2026-01-16", 1200)];
    expect(missingWeeks(readings, "2026-01-16")).toEqual(["2026-01-09"]);
    expect(missingWeeks(readings, "2026-01-29")).toEqual(["2026-01-09", "2026-01-23"]); // the week of 01-23 is current but still has no reading
    expect(missingWeeks(readings, "2026-01-22")).toEqual(["2026-01-09"]); // 01-22 is a Thursday, still the week of 01-16
  });

  it("[AC-MIL-02.5][AC-MIL-02.6] a reading added a day late fills the week it belongs to", () => {
    const readings = [r("2026-01-02", 1000), r("2026-01-16", 1200)];
    expect(missingWeeks([...readings, r("2026-01-10", 1100)], "2026-01-16")).toEqual([]);
  });

  it("[AC-MIL-02.6] has nothing to ask for before the first reading", () => {
    expect(missingWeeks([], "2026-01-16")).toEqual([]);
    expect(missingWeeks([r("2026-01-02", 1000)], "2026-01-05")).toEqual([]);
  });
});

describe("weeklyMiles properties", () => {
  const readingsArb = fc
    .array(fc.record({ day: fc.integer({ min: 0, max: 400 }), step: fc.integer({ min: 0, max: 500 }) }), { minLength: 2, maxLength: 25 })
    .map((items) => {
      const byDay = new Map<number, number>();
      for (const { day, step } of items) byDay.set(day, step);
      let total = 10_000;
      return [...byDay.entries()]
        .sort((x, y) => x[0] - y[0])
        .map(([day, step]) => {
          total += step;
          return { date: new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10), miles: total };
        });
    });

  it("[AC-MIL-02.4] the result is the same for any order the readings were entered in", () => {
    fc.assert(
      fc.property(readingsArb, fc.array(fc.nat(), { minLength: 30, maxLength: 30 }), (readings, rand) => {
        const shuffled = [...readings];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = rand[i]! % (i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
        }
        expect(weeklyMiles(shuffled)).toEqual(weeklyMiles(readings));
        expect(missingWeeks(shuffled, "2027-03-01")).toEqual(missingWeeks(readings, "2027-03-01"));
      }),
    );
  });

  it("[AC-MIL-02.1][AC-MIL-02.6] periods join end to end, so their days and miles add up to the first-to-last change with nothing guessed", () => {
    fc.assert(
      fc.property(readingsArb, (readings) => {
        const periods = weeklyMiles(readings);
        for (let i = 1; i < periods.length; i++) expect(periods[i]!.from).toBe(periods[i - 1]!.to);
        if (periods.length === 0) return;
        const days = periods.reduce((s, p) => s + p.days, 0);
        expect(days).toBe((Date.parse(periods.at(-1)!.to) - Date.parse(periods[0]!.from)) / 86_400_000);
        expect(periods.every((p) => p.miles >= 0 && p.days >= 1)).toBe(true);
        // Every week between the first and last is either a period end or counted as missed.
        expect(periods.reduce((s, p) => s + 1 + p.missedWeeks, 0)).toBe(
          (Date.parse(periods.at(-1)!.weekStart) - Date.parse(fridayStart(periods[0]!.from))) / (7 * 86_400_000),
        );
      }),
    );
  });
});

function fridayStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 5 + 7) % 7));
  return d.toISOString().slice(0, 10);
}
