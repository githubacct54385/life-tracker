import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fromPounds, toPounds, weightTrend, findSameDay, DEFAULT_TREND_DAYS, type WeightEntry } from "./weight";

// Invented values, stored in pounds (ADR-0007).
const e = (date: string, pounds: number): WeightEntry => ({ date, pounds });

describe("weightTrend", () => {
  it("[AC-HLT-01.2] each entry gets the average of the entries in the window ending on its date, oldest first", () => {
    const entries = [e("2026-01-03", 190), e("2026-01-01", 200), e("2026-01-02", 195), e("2026-01-10", 180)];
    expect(weightTrend(entries, { days: 3 })).toEqual([
      { date: "2026-01-01", pounds: 200, trendPounds: 200 },
      { date: "2026-01-02", pounds: 195, trendPounds: 197.5 },
      { date: "2026-01-03", pounds: 190, trendPounds: 195 },
      { date: "2026-01-10", pounds: 180, trendPounds: 180 }, // earlier entries are outside the window
    ]);
  });

  it("[AC-HLT-01.2] the window defaults to seven days, counted in dates and not in entries", () => {
    expect(DEFAULT_TREND_DAYS).toBe(7);
    const entries = [e("2026-01-01", 210), e("2026-01-07", 200), e("2026-01-08", 190)];
    const trend = weightTrend(entries);
    expect(trend[1]!.trendPounds).toBe(205); // 01-01 is six days before 01-07: inside the window
    expect(trend[2]!.trendPounds).toBe(195); // 01-01 is seven days before 01-08: outside it
  });

  it("[AC-HLT-01.2] no entries gives no trend, and the trend is rounded to one decimal place of a pound", () => {
    expect(weightTrend([])).toEqual([]);
    expect(weightTrend([e("2026-01-01", 100), e("2026-01-02", 100), e("2026-01-03", 101)], { days: 3 })[2]!.trendPounds).toBe(100.3);
  });

  it("[AC-HLT-01.3] two entries on one day are refused, because only one is kept", () => {
    expect(() => weightTrend([e("2026-01-01", 200), e("2026-01-01", 201)])).toThrow(/one entry per day/i);
  });

  it("[AC-HLT-01.2] rejects bad dates, weights and window sizes", () => {
    expect(() => weightTrend([e("2026-02-30", 200)])).toThrow(/date/i);
    expect(() => weightTrend([e("2026-02-01", 0)])).toThrow(/pounds/i);
    expect(() => weightTrend([e("2026-02-01", Number.NaN)])).toThrow(/pounds/i);
    expect(() => weightTrend([], { days: 0 })).toThrow(/days/i);
  });

  it("[AC-HLT-01.2] the trend always lies between the smallest and largest weight in its window, and ignores entry order", () => {
    const entryArb = fc.uniqueArray(fc.integer({ min: 0, max: 120 }), { minLength: 1, maxLength: 25 }).chain((days) =>
      fc.tuple(...days.map((d) => fc.integer({ min: 900, max: 4000 }).map((tenths) => e(new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10), tenths / 10)))),
    );
    fc.assert(
      fc.property(entryArb, (entries) => {
        const trend = weightTrend(entries);
        expect(weightTrend([...entries].reverse())).toEqual(trend);
        const lo = Math.min(...entries.map((x) => x.pounds));
        const hi = Math.max(...entries.map((x) => x.pounds));
        for (const t of trend) {
          expect(t.trendPounds).toBeGreaterThanOrEqual(lo - 0.05);
          expect(t.trendPounds).toBeLessThanOrEqual(hi + 0.05);
        }
      }),
    );
  });
});

describe("findSameDay", () => {
  it("[AC-HLT-01.3] finds the entry a new one would replace, so the screen can ask before replacing", () => {
    const saved = [e("2026-01-01", 200), e("2026-01-02", 199)];
    expect(findSameDay(saved, "2026-01-02")).toEqual(e("2026-01-02", 199));
    expect(findSameDay(saved, "2026-01-03")).toBeUndefined();
    expect(() => findSameDay(saved, "nope")).toThrow(/date/i);
  });
});

describe("pounds and kilograms", () => {
  it("[AC-HLT-01.4] converts for display and entry, with weights kept in pounds", () => {
    expect(fromPounds(220.5, "lb")).toBe(220.5);
    expect(fromPounds(220.5, "kg")).toBe(100); // 220.462... rounds to one decimal: 100.0
    expect(toPounds(100, "kg")).toBe(220.5);
    expect(toPounds(180.4, "lb")).toBe(180.4);
  });

  it("[AC-HLT-01.4] a value entered in kilograms and shown in kilograms comes back unchanged to one decimal", () => {
    fc.assert(
      fc.property(fc.integer({ min: 200, max: 3000 }), (tenths) => {
        const kg = tenths / 10;
        expect(fromPounds(toPounds(kg, "kg"), "kg")).toBe(kg);
      }),
    );
  });

  it("[AC-HLT-01.4] rejects a weight that is not a positive number", () => {
    expect(() => toPounds(-1, "kg")).toThrow(/weight/i);
    expect(() => fromPounds(Number.POSITIVE_INFINITY, "lb")).toThrow(/weight/i);
  });
});
