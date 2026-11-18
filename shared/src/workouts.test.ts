import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_WEEKLY_WORKOUT_TARGET, paceStreakDays, workoutsThisWeek, workoutTotals, type Workout } from "./workouts";

// Invented data. 2026-01-05 is a Monday.
const w = (date: string, minutes: number): Workout => ({ date, minutes });
const pushups = (date: string, reps: number): Workout => ({ date, minutes: null, reps });

describe("workoutTotals", () => {
  const items = [w("2026-01-04", 30), w("2026-01-05", 45), w("2026-01-11", 20), w("2026-01-12", 60), w("2026-02-01", 10)];

  it("[AC-HLT-04.2] totals count and minutes per week, newest first, weeks starting Monday", () => {
    expect(workoutTotals(items, "week")).toEqual([
      { period: "2026-01-26", count: 1, minutes: 10, reps: 0 },
      { period: "2026-01-12", count: 1, minutes: 60, reps: 0 },
      { period: "2026-01-05", count: 2, minutes: 65, reps: 0 },
      { period: "2025-12-29", count: 1, minutes: 30, reps: 0 },
    ]);
  });

  it("[AC-HLT-04.2] totals count and minutes per calendar month, newest first", () => {
    expect(workoutTotals(items, "month")).toEqual([
      { period: "2026-02", count: 1, minutes: 10, reps: 0 },
      { period: "2026-01", count: 4, minutes: 155, reps: 0 },
    ]);
  });

  it("[AC-HLT-04.2] a week can start on another day, and no workouts gives no periods", () => {
    expect(workoutTotals([w("2026-01-04", 30), w("2026-01-05", 45)], "week", { weekStartsOn: 0 })).toEqual([
      { period: "2026-01-04", count: 2, minutes: 75, reps: 0 },
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
          expect(totals.reduce((s, t) => s + t.minutes, 0)).toBe(list.reduce((s, x) => s + (x.minutes ?? 0), 0));
          expect(workoutTotals([...list].reverse(), kind)).toEqual(totals);
        }
      }),
    );
  });
});

describe("paceStreakDays", () => {
  const day = (offset: number) => new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10); // 2026-01-01 + offset
  const at = (...offsets: number[]) => offsets.map((o) => w(day(o), 30));

  it("[AC-HLT-04.3] workouts on consecutive days are not split by a week boundary", () => {
    // 2026-01-03 is a Saturday: workouts on Saturday, Sunday and Monday. A calendar week would split them.
    expect(day(2)).toBe("2026-01-03");
    expect(paceStreakDays(at(2, 3, 4), { target: 3, today: day(4) })).toBe(1); // on pace as of Monday
    expect(paceStreakDays(at(2, 3, 4), { target: 3, today: day(5) })).toBe(2); // and still on pace on Tuesday
  });

  it("[AC-HLT-04.3] counts the days in a row that the last 7 days held at least the target", () => {
    // Three workouts on days 0, 1, 2. On pace from day 2 through day 6 (the window still holds all three), off from day 7.
    const list = at(0, 1, 2);
    expect(paceStreakDays(list, { target: 3, today: day(2) })).toBe(1);
    expect(paceStreakDays(list, { target: 3, today: day(6) })).toBe(5);
    expect(paceStreakDays(list, { target: 3, today: day(7) })).toBe(5); // today off pace, but not yet over: counts back from yesterday
    expect(paceStreakDays(list, { target: 3, today: day(8) })).toBe(0); // yesterday is off pace too
  });

  it("[AC-HLT-04.3] a day that is not on pace yet does not break the streak, but the next one does", () => {
    const list = at(0, 2, 4, 6); // on pace from day 4 through day 8, off on day 9
    expect(paceStreakDays(list, { target: 3, today: day(8) })).toBe(5);
    expect(paceStreakDays(list, { target: 3, today: day(9) })).toBe(5);
    expect(paceStreakDays(list, { target: 3, today: day(10) })).toBe(0);
  });

  it("[AC-HLT-04.3] the target defaults to three workouts a week", () => {
    expect(DEFAULT_WEEKLY_WORKOUT_TARGET).toBe(3);
    expect(paceStreakDays(at(0, 1, 2), { today: day(2) })).toBe(1);
    expect(paceStreakDays(at(0, 1), { today: day(2) })).toBe(0);
  });

  it("[AC-HLT-04.3] several workouts on one day each count, ignores workouts after today, and an empty history is zero", () => {
    expect(paceStreakDays([...at(0), ...at(0), ...at(0)], { target: 3, today: day(0) })).toBe(1);
    expect(paceStreakDays(at(1, 2, 3), { target: 3, today: day(0) })).toBe(0);
    expect(paceStreakDays([], { today: day(0) })).toBe(0);
  });

  it("[AC-HLT-04.3] rejects a target below one and dates that are not real", () => {
    expect(() => paceStreakDays([], { target: 0, today: day(0) })).toThrow(/target/i);
    expect(() => paceStreakDays([w("2026-02-30", 5)], { today: day(0) })).toThrow(/date/i);
  });
});

describe("workoutsThisWeek (DSH-01)", () => {
  // 2026-01-05 is a Monday, so the week is 2026-01-05 to 2026-01-11.
  const items = [w("2026-01-04", 30), w("2026-01-05", 45), w("2026-01-07", 20), w("2026-01-11", 10), w("2026-01-12", 60)];

  it("[AC-DSH-01.1] counts the workouts and minutes in the week that contains today, weeks starting Monday", () => {
    expect(workoutsThisWeek(items, "2026-01-08")).toEqual({ count: 3, minutes: 75, reps: 0 });
    expect(workoutsThisWeek(items, "2026-01-05")).toEqual({ count: 3, minutes: 75, reps: 0 }); // Monday itself
    expect(workoutsThisWeek(items, "2026-01-11")).toEqual({ count: 3, minutes: 75, reps: 0 }); // Sunday still belongs to the week that began Monday
  });

  it("[AC-DSH-01.1] is zero for a week with no workouts, and a week can start on another day", () => {
    expect(workoutsThisWeek(items, "2026-01-20")).toEqual({ count: 0, minutes: 0, reps: 0 });
    expect(workoutsThisWeek([], "2026-01-08")).toEqual({ count: 0, minutes: 0, reps: 0 });
    expect(workoutsThisWeek(items, "2026-01-05", { weekStartsOn: 0 })).toEqual({ count: 3, minutes: 95, reps: 0 }); // Sunday Jan 4 to Saturday Jan 10: Jan 4, 5 and 7
  });

  it("[AC-DSH-01.1] rejects a date that is not real", () => {
    expect(() => workoutsThisWeek(items, "2026-02-30")).toThrow();
  });
});

describe("workouts counted in repetitions (pushups)", () => {
  it("[AC-HLT-02.4] a pushups workout counts as a workout and adds its reps, and no minutes, to the weekly and monthly totals", () => {
    const items = [w("2026-01-05", 30), pushups("2026-01-06", 40), pushups("2026-01-08", 25)];
    expect(workoutTotals(items, "week")).toEqual([{ period: "2026-01-05", count: 3, minutes: 30, reps: 65 }]);
    expect(workoutTotals(items, "month")).toEqual([{ period: "2026-01", count: 3, minutes: 30, reps: 65 }]);
  });

  it("[AC-HLT-02.4] this week's totals include pushups reps, and pushups count toward the streak like any workout", () => {
    const items = [pushups("2026-01-05", 20), pushups("2026-01-06", 20), w("2026-01-07", 10)];
    expect(workoutsThisWeek(items, "2026-01-08")).toEqual({ count: 3, minutes: 10, reps: 40 });
    expect(paceStreakDays(items, { today: "2026-01-08" })).toBeGreaterThan(0);
  });
});
