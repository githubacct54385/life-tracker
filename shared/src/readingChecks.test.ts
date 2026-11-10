import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkReading, DEFAULT_MAX_MILES_PER_DAY, type CheckedReading } from "./readingChecks";

// Invented values.
const r = (date: string, miles: number): CheckedReading => ({ date, miles });
const existing = [r("2026-01-02", 1000), r("2026-01-09", 1100), r("2026-01-23", 1300)];

describe("checkReading", () => {
  it("[AC-MIL-01.2] a reading lower than the previous one gives a warning that needs confirmation", () => {
    const result = checkReading(existing, r("2026-01-16", 1050));
    expect(result.needsConfirmation).toBe(true);
    expect(result.warnings).toEqual([{ kind: "lower_than_previous", previous: r("2026-01-09", 1100) }]);
  });

  it("[AC-MIL-01.2] a past-dated reading higher than a later one is also flagged", () => {
    const result = checkReading(existing, r("2026-01-16", 1400));
    expect(result.warnings).toEqual([{ kind: "higher_than_next", next: r("2026-01-23", 1300) }]);
    expect(result.needsConfirmation).toBe(true);
  });

  it("[AC-MIL-01.2] a reading equal to the previous one, or in line with its neighbours, is fine", () => {
    expect(checkReading(existing, r("2026-01-16", 1100)).warnings).toEqual([]);
    const ok = checkReading(existing, r("2026-01-16", 1200));
    expect(ok).toEqual({ warnings: [], needsConfirmation: false });
  });

  it("[AC-MIL-01.3] an implausibly high jump warns, measured in miles per day since the previous reading", () => {
    const result = checkReading(existing, r("2026-01-30", 1300 + 7 * DEFAULT_MAX_MILES_PER_DAY + 1));
    expect(result.warnings).toEqual([{ kind: "implausible_jump", miles: 7 * DEFAULT_MAX_MILES_PER_DAY + 1, days: 7 }]);
    expect(result.needsConfirmation).toBe(true);
    expect(checkReading(existing, r("2026-01-30", 1300 + 7 * DEFAULT_MAX_MILES_PER_DAY)).warnings).toEqual([]);
  });

  it("[AC-MIL-01.3] the limit can be set, and a same-day second reading uses one day", () => {
    expect(checkReading(existing, r("2026-01-24", 1500), { maxMilesPerDay: 100 }).warnings).toHaveLength(1);
    expect(checkReading(existing, r("2026-01-23", 1300 + DEFAULT_MAX_MILES_PER_DAY + 1)).warnings.map((w) => w.kind)).toEqual(["implausible_jump"]);
  });

  it("[AC-MIL-01.4] a reading for a past date is checked against both neighbours, and the first reading has nothing to compare with", () => {
    expect(checkReading([], r("2026-01-02", 5)).warnings).toEqual([]);
    expect(checkReading(existing, r("2025-12-26", 900)).warnings).toEqual([]);
    expect(checkReading(existing, r("2025-12-26", 1200)).warnings.map((w) => w.kind)).toEqual(["higher_than_next"]);
  });

  it("[AC-MIL-01.4] editing a reading ignores the entry being replaced", () => {
    // Changing the reading dated 01-09 from 1100 to 1150 must not compare it with its own old value.
    const result = checkReading(existing, r("2026-01-09", 1150), { replaces: "2026-01-09" });
    expect(result.warnings).toEqual([]);
    expect(checkReading(existing, r("2026-01-09", 950), { replaces: "2026-01-09" }).warnings.map((w) => w.kind)).toEqual(["lower_than_previous"]);
  });

  it("[AC-MIL-01.4] rejects bad dates and miles", () => {
    expect(() => checkReading(existing, r("2026-02-30", 1))).toThrow(/date/i);
    expect(() => checkReading(existing, r("2026-02-01", -1))).toThrow(/miles/i);
    expect(() => checkReading(existing, r("2026-02-01", Number.NaN))).toThrow(/miles/i);
  });

  it("[AC-MIL-01.2][AC-MIL-01.3] a reading that keeps a rising odometer within the daily limit never warns, wherever it falls", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 300 }), { minLength: 2, maxLength: 12 }), fc.nat(), (gaps, pick) => {
        // Build a rising odometer at 50 miles a day, then insert a reading on an unused day along the same line.
        const days = [...new Set(gaps.map((g) => g))].sort((a, b) => a - b);
        const date = (d: number) => new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
        const list = days.map((d) => r(date(d), 10_000 + d * 50));
        const free = Array.from({ length: 301 }, (_, i) => i).filter((d) => !days.includes(d));
        const d = free[pick % free.length]!;
        expect(checkReading(list, r(date(d), 10_000 + d * 50)).warnings).toEqual([]);
      }),
    );
  });
});
