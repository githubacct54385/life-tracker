import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { weeklyWorkoutChart, type ChartWorkout } from "./workoutChart.js";
import { saveWorkoutGoalRequestSchema, workoutGoalSchema } from "./workoutGoal.js";

// 2026-11-25 is a Wednesday. Its week runs Friday 2026-11-20 to Thursday 2026-11-26.
const TODAY = "2026-11-25";
const run = (date: string, minutes: number | null = 30, type = "Run"): ChartWorkout => ({ date, type, minutes });

describe("weekly workout chart (HLT-05)", () => {
  it("[AC-HLT-05.1] shows the last 12 weeks, oldest first, Friday to Thursday, ending with the week that contains today", () => {
    const chart = weeklyWorkoutChart([], TODAY, null);
    expect(chart.weeks).toHaveLength(12);
    expect(chart.weeks.at(-1)).toMatchObject({ start: "2026-11-20", end: "2026-11-26", current: true });
    expect(chart.weeks[0]).toMatchObject({ start: "2026-09-04", end: "2026-09-10", current: false });
    expect(chart.weeks.filter((w) => w.current)).toHaveLength(1);
  });

  it("[AC-HLT-05.1] a Thursday belongs to the week before the Friday, and the Friday starts a new week", () => {
    const chart = weeklyWorkoutChart([run("2026-11-19"), run("2026-11-20")], TODAY, null);
    expect(chart.weeks.at(-2)!.count).toBe(1);
    expect(chart.weeks.at(-1)!.count).toBe(1);
  });

  it("[AC-HLT-05.1] counts workouts and minutes per week, includes weeks with none, and ignores later days and older weeks", () => {
    const chart = weeklyWorkoutChart([run("2026-11-21", 30), run("2026-11-24", 45), run("2026-11-27", 99), run("2025-01-01", 99)], TODAY, null);
    expect(chart.weeks.at(-1)).toMatchObject({ count: 2, minutes: 75 });
    expect(chart.weeks.at(-2)).toMatchObject({ count: 0, minutes: 0, byType: [] });
    expect(chart.hasWorkouts).toBe(true);
  });

  it("[AC-HLT-05.2] splits each week by workout type, in one order for every week, and a pushup session counts as a workout with no minutes", () => {
    const chart = weeklyWorkoutChart([run("2026-11-21", 30, "Run"), run("2026-11-22", 20, "Run"), run("2026-11-23", null, "Pushups"), run("2026-11-14", 40, "Yoga")], TODAY, null);
    expect(chart.types).toEqual(["Run", "Pushups", "Yoga"]);
    expect(chart.weeks.at(-1)).toMatchObject({ count: 3, minutes: 50 });
    expect(chart.weeks.at(-1)!.byType).toEqual([
      { type: "Run", count: 2, minutes: 50 },
      { type: "Pushups", count: 1, minutes: 0 },
    ]);
    expect(chart.weeks.at(-2)!.byType).toEqual([{ type: "Yoga", count: 1, minutes: 40 }]);
  });

  it("[AC-HLT-05.3] with a goal, says how many workouts are left this week, and 0 once it is met", () => {
    expect(weeklyWorkoutChart([run("2026-11-21")], TODAY, 3)).toMatchObject({ goal: 3, left: 2 });
    expect(weeklyWorkoutChart([run("2026-11-21"), run("2026-11-22"), run("2026-11-23"), run("2026-11-24")], TODAY, 3).left).toBe(0);
  });

  it("[AC-HLT-05.4] the streak counts weeks in a row that met the goal, and a week still in progress never breaks it", () => {
    const week = (start: string, n: number) => Array.from({ length: n }, (_, i) => run(toDay(start, i)));
    // Two full weeks met the goal of 3 (Nov 6 to 12 and Nov 13 to 19). This week has 1 so far.
    const workouts = [...week("2026-11-06", 3), ...week("2026-11-13", 3), ...week("2026-11-20", 1)];
    expect(weeklyWorkoutChart(workouts, TODAY, 3).streakWeeks).toBe(2);
    // Once this week meets the goal it counts too.
    expect(weeklyWorkoutChart([...workouts, ...week("2026-11-21", 2)], TODAY, 3).streakWeeks).toBe(3);
  });

  it("[AC-HLT-05.4] a finished week that missed the goal ends the streak, and with no goal there is no streak", () => {
    const week = (start: string, n: number) => Array.from({ length: n }, (_, i) => run(toDay(start, i)));
    const workouts = [...week("2026-10-30", 3), ...week("2026-11-06", 2), ...week("2026-11-13", 3)];
    expect(weeklyWorkoutChart(workouts, TODAY, 3).streakWeeks).toBe(1);
    expect(weeklyWorkoutChart(workouts, TODAY, null).streakWeeks).toBe(0);
  });

  it("[AC-HLT-05.5] with no goal there is no line and nothing left to do, and with no workouts the chart says so", () => {
    const chart = weeklyWorkoutChart([], TODAY, null);
    expect(chart).toMatchObject({ goal: null, left: null, streakWeeks: 0, hasWorkouts: false, types: [] });
  });

  it("[AC-HLT-05.1] rejects a date that is not a calendar date, and a goal that is not a whole number of at least 1", () => {
    expect(() => weeklyWorkoutChart([run("2026-02-30")], TODAY, null)).toThrow(/calendar date/);
    expect(() => weeklyWorkoutChart([], TODAY, 0)).toThrow(/whole number/);
    expect(() => weeklyWorkoutChart([], TODAY, 2.5)).toThrow(/whole number/);
  });

  it("[AC-HLT-05.1] every workout in the weeks shown is counted exactly once", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 95 }), { maxLength: 60 }), (offsets) => {
        const workouts = offsets.map((back) => run(toDay("2026-11-25", -back)));
        const chart = weeklyWorkoutChart(workouts, TODAY, null);
        const inRange = workouts.filter((w) => w.date >= chart.weeks[0]!.start);
        expect(chart.weeks.reduce((sum, w) => sum + w.count, 0)).toBe(inRange.length);
        expect(chart.weeks.reduce((sum, w) => sum + w.byType.reduce((s, t) => s + t.count, 0), 0)).toBe(inRange.length);
      }),
    );
  });
});

describe("workout goal shapes (HLT-05)", () => {
  it("[AC-HLT-05.6] a goal is a whole number from 1 to 14, and nothing else is accepted", () => {
    for (const ok of [1, 3, 14]) expect(saveWorkoutGoalRequestSchema.safeParse({ perWeek: ok }).success).toBe(true);
    for (const bad of [0, 15, -1, 2.5, "3", null, undefined]) expect(saveWorkoutGoalRequestSchema.safeParse({ perWeek: bad }).success).toBe(false);
    expect(saveWorkoutGoalRequestSchema.safeParse({ perWeek: 3, extra: 1 }).success).toBe(false);
  });

  it("[AC-HLT-05.6] the answer is the goal, or null before one is set", () => {
    expect(workoutGoalSchema.safeParse({ perWeek: null }).success).toBe(true);
    expect(workoutGoalSchema.safeParse({ perWeek: 4 }).success).toBe(true);
    expect(workoutGoalSchema.safeParse({ perWeek: 20 }).success).toBe(false);
  });
});

/** The date `offset` days after `date` (before it when negative). */
function toDay(date: string, offset: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
}
