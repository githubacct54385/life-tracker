import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { weightWorkoutChart, WEIGHT_WORKOUT_RANGES, MIN_WEIGHT_WEEKS } from "./weightWorkoutChart.js";

// 2026-11-26 is a Thursday, so its week runs Friday 2026-11-20 to Thursday 2026-11-26.
const TODAY = "2026-11-26";
const workout = (date: string, minutes: number | null = 30, type = "Run") => ({ date, type, minutes });
const weight = (date: string, pounds: number) => ({ date, pounds });

describe("weightWorkoutChart", () => {
  it("[AC-HLT-06.1] covers 13, 26 or 52 weeks for 3, 6 or 12 months, newest last, each starting on a Friday", () => {
    for (const [months, weeks] of [[3, 13], [6, 26], [12, 52]] as const) {
      const chart = weightWorkoutChart([], [], TODAY, months);
      expect(chart.months).toBe(months);
      expect(chart.weeks).toHaveLength(weeks);
      expect(chart.weeks.at(-1)).toMatchObject({ start: "2026-11-20", end: "2026-11-26", current: true });
      for (const week of chart.weeks) expect(new Date(`${week.start}T00:00:00Z`).getUTCDay()).toBe(5);
    }
    expect(weightWorkoutChart([], [], TODAY).months).toBe(6);
    expect([...WEIGHT_WORKOUT_RANGES]).toEqual([3, 6, 12]);
  });

  it("[AC-HLT-06.1] adds up the minutes in each week, and a pushup session adds none", () => {
    const chart = weightWorkoutChart([], [workout("2026-11-20", 30), workout("2026-11-22", 45), workout("2026-11-21", null, "Pushups"), workout("2026-11-13", 20)], TODAY, 3);
    expect(chart.weeks.at(-1)).toMatchObject({ minutes: 75, count: 3 });
    expect(chart.weeks.at(-2)).toMatchObject({ minutes: 20, count: 1 });
    expect(chart.hasWorkouts).toBe(true);
  });

  it("[AC-HLT-06.1] the weight for a week is the 7-day moving average at the last reading of that week", () => {
    // Readings on Mon 16 (170), Fri 20 (172) and Sun 22 (174). The average at Sun 22 covers Nov 16 to 22: (170 + 172 + 174) / 3 = 172.
    const chart = weightWorkoutChart([weight("2026-11-16", 170), weight("2026-11-20", 172), weight("2026-11-22", 174)], [], TODAY, 3);
    expect(chart.weeks.at(-1)).toMatchObject({ weightPounds: 172, readings: 2 });
    // Mon 16 is in the week of Friday Nov 13, with only itself in the window.
    expect(chart.weeks.at(-2)).toMatchObject({ weightPounds: 170, readings: 1 });
  });

  it("[AC-HLT-06.2] a week with no weight reading has no weight (a gap, not a zero), and a week with no workouts has no minutes", () => {
    const chart = weightWorkoutChart([weight("2026-11-22", 170)], [workout("2026-11-13", 30)], TODAY, 3);
    const gap = chart.weeks.at(-3)!;
    expect(gap).toMatchObject({ weightPounds: null, readings: 0, minutes: 0, count: 0 });
    expect(chart.weeks.at(-1)).toMatchObject({ weightPounds: 170, minutes: 0 });
    expect(chart.weeks.at(-2)).toMatchObject({ weightPounds: null, minutes: 30 });
  });

  it("[AC-HLT-06.4] needs readings in at least four weeks, and says how many it has", () => {
    const readings = (n: number) => Array.from({ length: n }, (_, i) => weight(`2026-11-${String(22 - 7 * i).padStart(2, "0")}`, 170 + i)).filter((w) => w.date >= "2026-10-01");
    expect(MIN_WEIGHT_WEEKS).toBe(4);
    expect(weightWorkoutChart(readings(3), [], TODAY, 3)).toMatchObject({ weeksWithWeight: 3, enoughWeight: false });
    expect(weightWorkoutChart(readings(4), [], TODAY, 3)).toMatchObject({ weeksWithWeight: 4, enoughWeight: true });
    expect(weightWorkoutChart([], [], TODAY, 3)).toMatchObject({ weeksWithWeight: 0, enoughWeight: false, hasWorkouts: false });
    // Several readings in one week count as one week.
    expect(weightWorkoutChart([weight("2026-11-20", 170), weight("2026-11-21", 171), weight("2026-11-22", 172), weight("2026-11-23", 173)], [], TODAY, 3).weeksWithWeight).toBe(1);
  });

  it("[AC-HLT-06.1] ignores readings and workouts after today and before the range", () => {
    const chart = weightWorkoutChart([weight("2026-11-27", 999), weight("2020-01-01", 100)], [workout("2026-11-27", 99), workout("2020-01-01", 99)], TODAY, 3);
    expect(chart.weeks.every((w) => w.weightPounds === null && w.minutes === 0)).toBe(true);
  });

  it("[AC-HLT-06.1] the weeks are contiguous, and the minutes shown add up to the workouts in range, whatever the data", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ day: fc.integer({ min: -400, max: 5 }), minutes: fc.option(fc.integer({ min: 1, max: 300 }), { nil: null }) }), { maxLength: 30 }),
        fc.constantFrom(...WEIGHT_WORKOUT_RANGES),
        (rows, months) => {
          const date = (offset: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
          const workouts = rows.map((r) => workout(date(r.day), r.minutes));
          const chart = weightWorkoutChart([], workouts, TODAY, months);
          for (let i = 1; i < chart.weeks.length; i++) {
            const gap = (Date.parse(`${chart.weeks[i]!.start}T00:00:00Z`) - Date.parse(`${chart.weeks[i - 1]!.start}T00:00:00Z`)) / 86_400_000;
            if (gap !== 7) return false;
          }
          const first = chart.weeks[0]!.start;
          const expected = workouts.filter((w) => w.date >= first && w.date <= TODAY).reduce((sum, w) => sum + (w.minutes ?? 0), 0);
          return chart.weeks.reduce((sum, w) => sum + w.minutes, 0) === expected;
        },
      ),
    );
  });
});
