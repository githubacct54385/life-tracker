import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { weeklyMiles, type OdometerReading } from "./mileage";

// All dates and values are invented. 2026-01-02 is a Friday.
const r = (date: string, miles: number): OdometerReading => ({ date, miles });

describe("weeklyMiles", () => {
  it("[AC-MIL-02.1] a week runs Friday to Thursday and its miles are the difference between consecutive Fridays", () => {
    const weeks = weeklyMiles([r("2026-01-02", 1000), r("2026-01-09", 1120), r("2026-01-16", 1150)]);
    expect(weeks).toEqual([
      { start: "2026-01-02", end: "2026-01-08", miles: 120, estimated: false },
      { start: "2026-01-09", end: "2026-01-15", miles: 30, estimated: false },
    ]);
  });

  it("[AC-MIL-02.2] a Friday with no reading is interpolated by date between the nearest readings on either side", () => {
    // Readings on Thursday 01-01 (1000) and Wednesday 01-14 (1130): 13 days, 10 miles per day.
    // Fridays 01-02 and 01-09: values 1010 and 1080. 01-16 is past the last reading, so there is no week after 01-09.
    const weeks = weeklyMiles([r("2026-01-01", 1000), r("2026-01-14", 1130)]);
    expect(weeks).toEqual([{ start: "2026-01-02", end: "2026-01-08", miles: 70, estimated: true }]);
  });

  it("[AC-MIL-02.2] readings on any weekday take part, and a real Friday reading beats interpolation", () => {
    const weeks = weeklyMiles([r("2026-01-02", 500), r("2026-01-06", 540), r("2026-01-09", 600), r("2026-01-16", 700)]);
    expect(weeks.map((w) => [w.start, w.miles, w.estimated])).toEqual([
      ["2026-01-02", 100, false],
      ["2026-01-09", 100, false],
    ]);
  });

  it("[AC-MIL-02.2] never extrapolates before the first reading or after the last", () => {
    expect(weeklyMiles([])).toEqual([]);
    expect(weeklyMiles([r("2026-01-02", 1000)])).toEqual([]); // one Friday, no second to subtract
    expect(weeklyMiles([r("2026-01-03", 1000), r("2026-01-08", 1100)])).toEqual([]); // no two Fridays inside the range
    const weeks = weeklyMiles([r("2026-01-05", 1000), r("2026-01-30", 1250)]);
    expect(weeks[0]!.start).toBe("2026-01-09"); // first Friday on or after the first reading
    expect(weeks.at(-1)!.end).toBe("2026-01-29"); // 01-30 is a Friday with a real reading, so the last week ends the day before
  });

  it("[AC-MIL-02.3] a week is estimated when either of its Fridays is interpolated", () => {
    const weeks = weeklyMiles([r("2026-01-02", 0), r("2026-01-12", 100), r("2026-01-16", 140), r("2026-01-23", 200)]);
    expect(weeks.map((w) => [w.start, w.estimated])).toEqual([
      ["2026-01-02", true], // 01-09 interpolated
      ["2026-01-09", true], // 01-09 interpolated
      ["2026-01-16", false],
    ]);
  });

  it("[AC-MIL-02.4] two readings on one date keep the higher value, so the result does not depend on entry order", () => {
    const a = weeklyMiles([r("2026-01-02", 100), r("2026-01-02", 90), r("2026-01-09", 200)]);
    const b = weeklyMiles([r("2026-01-09", 200), r("2026-01-02", 90), r("2026-01-02", 100)]);
    expect(a).toEqual(b);
    expect(a[0]!.miles).toBe(100);
  });

  it("[AC-MIL-02.4] editing or deleting a reading recalculates only from the readings given", () => {
    const base = [r("2026-01-02", 1000), r("2026-01-09", 1100), r("2026-01-16", 1300)];
    expect(weeklyMiles(base).map((w) => w.miles)).toEqual([100, 200]);
    expect(weeklyMiles([base[0]!, r("2026-01-09", 1150), base[2]!]).map((w) => w.miles)).toEqual([150, 150]);
    const deleted = weeklyMiles([base[0]!, base[2]!]);
    expect(deleted.map((w) => [w.miles, w.estimated])).toEqual([[150, true], [150, true]]);
  });

  it("[AC-MIL-02.1] rejects dates that are not real calendar dates", () => {
    expect(() => weeklyMiles([r("2026-02-30", 1)])).toThrow(/date/i);
    expect(() => weeklyMiles([r("01/02/2026", 1)])).toThrow(/date/i);
  });
});

describe("weeklyMiles properties", () => {
  const readingsArb = fc
    .array(fc.record({ day: fc.integer({ min: 0, max: 400 }), step: fc.integer({ min: 0, max: 500 }) }), { minLength: 2, maxLength: 25 })
    .map((items) => {
      // Build a non-decreasing odometer over distinct days, from a Friday-agnostic start date.
      const byDay = new Map<number, number>();
      for (const { day, step } of items) byDay.set(day, step);
      let total = 10_000;
      return [...byDay.entries()]
        .sort((x, y) => x[0] - y[0])
        .map(([day, step]) => {
          total += step;
          const d = new Date(Date.UTC(2026, 0, 1 + day));
          return { date: d.toISOString().slice(0, 10), miles: total };
        });
    });

  it("[AC-MIL-02.4] the result is the same for any order the readings were entered in", () => {
    fc.assert(
      fc.property(readingsArb, fc.infiniteStream(fc.nat()), (readings, rand) => {
        const shuffled = [...readings];
        const it = rand[Symbol.iterator]();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = it.next().value % (i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
        }
        expect(weeklyMiles(shuffled)).toEqual(weeklyMiles(readings));
      }),
    );
  });

  it("[AC-MIL-02.1][AC-MIL-02.2] weekly miles add up to the odometer change between the first and last Friday, and are never negative", () => {
    fc.assert(
      fc.property(readingsArb, (readings) => {
        const weeks = weeklyMiles(readings);
        const total = weeks.reduce((sum, w) => sum + w.miles, 0);
        if (weeks.length === 0) return;
        const first = weeks[0]!.start;
        const last = weeks.at(-1)!.end;
        // Weeks are contiguous, each exactly seven days.
        for (let i = 1; i < weeks.length; i++) {
          const prevEnd = Date.parse(weeks[i - 1]!.end) + 86_400_000;
          expect(Date.parse(weeks[i]!.start)).toBe(prevEnd);
        }
        expect(Date.parse(last) - Date.parse(first)).toBe((7 * weeks.length - 1) * 86_400_000);
        expect(weeks.every((w) => w.miles >= -1e-9)).toBe(true);
        const odo = readings.at(-1)!.miles - readings[0]!.miles;
        expect(total).toBeLessThanOrEqual(odo + 1e-6);
      }),
    );
  });
});
