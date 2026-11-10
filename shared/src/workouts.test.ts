import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_WEEKLY_WORKOUT_TARGET, weeklyStreak, workoutTotals, type Workout } from "./workouts";

// Invented data. 2026-01-05 is a Monday.
const w = (date: string, minutes: number): Workout => ({ date, minutes });

describe("workoutTotals", () => {
  const items = [w("2026-01-04", 30), w("2026-01-05", 45), w("2026-01-11", 20), w("2026-01-12", 60), w("2026-02-01", 10)];

  it("[AC-HLT-04.2] totals count and minutes per week, newest first, weeks starting Monday", () => {
    expect(workoutTotals(items, "week")).toEqual([
      { period: "2026-01-26", count: 1, minutes: 10 },
      { period: "2026-01-12", count: 1, minutes: 60 },
      { period: "2026-01-05", count: 2, minutes: 65 },
      { period: "2025-12-29", count: 1, minutes: 30 },
    ]);
  });

  it("[AC-HLT-04.2] totals count and minutes per calendar month, newest first", () => {
    expect(workoutTotals(items, "month")).toEqual([
      { period: "2026-02", count: 1, minutes: 10 },
      { period: "2026-01", count: 4, minutes: 155 },
    ]);
  });

  it("[AC-HLT-04.2] a week can start on another day, and no workouts gives no periods", () => {
    expect(workoutTotals([w("2026-01-04", 30), w("2026-01-05", 45)], "week", { weekStartsOn: 0 })).toEqual([
      { period: "2026-01-04", count: 2, minutes: 75 },
    ]);
    expect(workoutTotals([], "week")).toEqual([]);
  });

  it("[AC-HLT-04.2] rejects dates that are not real calendar dates", () => {
    expect(() => workoutTotals([w("2026-13-01", 5)], "month")).toThrow(/date/i);
  });

  it("[AC-HLT-04.2] weekly and monthly counts and minutes each add up to the overall totals, in any entry order", () => {
    const workoutArb = fc.record({ day: fc.integer({ min: 0, max: 500 }), minutes: fc.integer({ min: 1, max: 240 }) }).map(({ day, minutes }) => w(new Date(Date.UTC(2025, 0, 1 + day)).toISOString().slice(0, 10), minutes));
    fc.assert(
      fc.property(fc.array(workoutArb, { maxLength: 40 }), (list) => {
        for (const kind of ["week", "month"] as const) {
          const totals = workoutTotals(list, kind);
          expect(totals.reduce((s, t) => s + t.count, 0)).toBe(list.length);
          expect(totals.reduce((s, t) => s + t.minutes, 0)).toBe(list.reduce((s, x) => s + x.minutes, 0));
          expect(workoutTotals([...list].reverse(), kind)).toEqual(totals);
        }
      }),
    );
  });
});

describe("weeklyStreak", () => {
  const today = "2026-01-21"; // Wednesday of the week starting 2026-01-19

  it("[AC-HLT-04.3] counts consecutive weeks that meet the target, ending at the latest finished week", () => {
    const list = [w("2026-01-05", 30), w("2026-01-07", 30), w("2026-01-12", 30), w("2026-01-14", 30), w("2026-01-13", 30)];
    expect(weeklyStreak(list, { target: 2, today })).toBe(2); // weeks of 01-05 and 01-12; current week empty but not over
  });

  it("[AC-HLT-04.3] the current week counts once it meets the target, and does not break the streak while it is short", () => {
    const base = [w("2026-01-12", 30), w("2026-01-13", 30)];
    expect(weeklyStreak(base, { target: 2, today })).toBe(1);
    expect(weeklyStreak([...base, w("2026-01-19", 30), w("2026-01-20", 30)], { target: 2, today })).toBe(2);
    expect(weeklyStreak([...base, w("2026-01-19", 30)], { target: 2, today })).toBe(1);
  });

  it("[AC-HLT-04.3] a finished week below the target ends the streak, and an empty history is zero", () => {
    const list = [w("2026-01-05", 30), w("2026-01-06", 30), w("2026-01-12", 30), w("2026-01-19", 30), w("2026-01-20", 30)];
    expect(weeklyStreak(list, { target: 2, today })).toBe(1); // 01-12 week had one workout; current week has two
    expect(weeklyStreak([], { target: 1, today })).toBe(0);
  });

  it("[AC-HLT-04.3] the target defaults to three workouts a week", () => {
    expect(DEFAULT_WEEKLY_WORKOUT_TARGET).toBe(3);
    const three = (monday: string) => [w(monday, 20), w(monday.replace(/\d\d$/, (d) => String(Number(d) + 1).padStart(2, "0")), 20), w(monday.replace(/\d\d$/, (d) => String(Number(d) + 2).padStart(2, "0")), 20)];
    expect(weeklyStreak([...three("2026-01-05"), ...three("2026-01-12")], { today })).toBe(2);
    expect(weeklyStreak([w("2026-01-12", 20), w("2026-01-13", 20)], { today })).toBe(0);
  });

  it("[AC-HLT-04.3] rejects a target below one", () => {
    expect(() => weeklyStreak([], { target: 0, today })).toThrow(/target/i);
  });

  it("[AC-HLT-04.3] ignores workouts dated after today", () => {
    expect(weeklyStreak([w("2026-01-26", 30)], { target: 1, today })).toBe(0);
  });
});
