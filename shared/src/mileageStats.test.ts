import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { MilesPeriod } from "./mileage";
import { busiestAndQuietest, monthlyTotals, rollingAverages, yearlyTotals } from "./mileageStats";

// All values are invented.
const p = (to: string, miles: number, days = 7): MilesPeriod => ({
  from: "2000-01-01",
  to,
  days,
  miles,
  weekStart: to,
  missedWeeks: days > 8 ? Math.round(days / 7) - 1 : 0,
});

describe("rollingAverages", () => {
  it("[AC-MIL-03.2] gives no average until 8 weekly periods exist, then the miles per week of the latest 8", () => {
    const periods = Array.from({ length: 9 }, (_, i) => p(`2026-01-${String(i + 1).padStart(2, "0")}`, 100 + i * 10));
    const averages = rollingAverages(periods);
    expect(averages.slice(0, 7).every((a) => a === undefined)).toBe(true);
    expect(averages[7]).toBeCloseTo((100 + 110 + 120 + 130 + 140 + 150 + 160 + 170) / 8);
    expect(averages[8]).toBeCloseTo((110 + 120 + 130 + 140 + 150 + 160 + 170 + 180) / 8);
  });

  it("[AC-MIL-03.2] a longer period counts for its real length, so a missed week does not inflate the average", () => {
    const periods = [...Array.from({ length: 7 }, (_, i) => p(`2026-01-0${i + 1}`, 70)), p("2026-01-22", 280, 14)];
    // 7 x 70 + 280 = 770 miles over 7 x 7 + 14 = 63 days -> 85.56 a week (counting the period as one week would give 96.25)
    expect(rollingAverages(periods)[7]).toBeCloseTo((770 / 63) * 7);
  });
});

describe("monthlyTotals and yearlyTotals", () => {
  const periods = [p("2025-12-26", 100), p("2026-01-02", 120), p("2026-01-09", 80), p("2026-02-06", 50, 28)];

  it("[AC-MIL-03.2] adds each period to the month of the reading that ends it, oldest first", () => {
    expect(monthlyTotals(periods)).toEqual([
      { month: "2025-12", miles: 100 },
      { month: "2026-01", miles: 200 },
      { month: "2026-02", miles: 50 },
    ]);
  });

  it("[AC-MIL-03.2] adds each period to the year of the reading that ends it", () => {
    expect(yearlyTotals(periods)).toEqual([
      { year: "2025", miles: 100 },
      { year: "2026", miles: 250 },
    ]);
  });

  it("[AC-MIL-03.2] monthly totals add up to the same miles as the periods, whatever the data", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 0, max: 800 })), { maxLength: 40 }), (rows) => {
        const list = rows.map(([offset, miles]) => p(new Date(Date.UTC(2024, 0, 1 + offset)).toISOString().slice(0, 10), miles));
        const total = list.reduce((sum, x) => sum + x.miles, 0);
        expect(monthlyTotals(list).reduce((s, x) => s + x.miles, 0)).toBe(total);
        expect(yearlyTotals(list).reduce((s, x) => s + x.miles, 0)).toBe(total);
      }),
    );
  });
});

describe("busiestAndQuietest", () => {
  it("[AC-MIL-03.3] names the single-week periods with the most and fewest miles", () => {
    const periods = [p("2026-01-02", 120), p("2026-01-09", 300), p("2026-01-16", 40), p("2026-01-23", 90)];
    expect(busiestAndQuietest(periods)).toEqual({ busiest: periods[1], quietest: periods[2] });
  });

  it("[AC-MIL-03.3] ignores periods that cover a missed week, which would otherwise look busy", () => {
    const periods = [p("2026-01-02", 100), p("2026-01-16", 400, 14), p("2026-01-23", 60)];
    expect(busiestAndQuietest(periods)).toEqual({ busiest: periods[0], quietest: periods[2] });
  });

  it("[AC-MIL-03.3] a tie picks the earlier week, and no weeks gives nothing", () => {
    const periods = [p("2026-01-02", 100), p("2026-01-09", 100)];
    expect(busiestAndQuietest(periods)).toEqual({ busiest: periods[0], quietest: periods[0] });
    expect(busiestAndQuietest([])).toBeUndefined();
    expect(busiestAndQuietest([p("2026-01-16", 400, 14)])).toBeUndefined();
  });
});
