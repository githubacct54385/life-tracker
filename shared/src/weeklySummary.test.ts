import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { weeklySummary } from "./weeklySummary";

// Synthetic data. Today is Tuesday 2026-11-24, so this week runs Friday 2026-11-20 to Thursday 2026-11-26, and the week before runs 2026-11-13 to 2026-11-19.
const today = "2026-11-24";
const none = { readings: [], workouts: [], weights: [], gifts: [], special: [] };
const gift = (dateGiven: string, cents: number) => ({ dateGiven, forMonth: dateGiven.slice(0, 7), cents });
const special = (dateGiven: string, cents: number) => ({ dateGiven, occasion: "Example", cents });

describe("weeklySummary", () => {
  it("[AC-DSH-02.1] names the week, Friday to Thursday, that contains today", () => {
    expect(weeklySummary(none, today)).toMatchObject({ weekStart: "2026-11-20", weekEnd: "2026-11-26" });
    expect(weeklySummary(none, "2026-11-20")).toMatchObject({ weekStart: "2026-11-20" }); // a Friday starts its own week
    expect(weeklySummary(none, "2026-11-19")).toMatchObject({ weekStart: "2026-11-13", weekEnd: "2026-11-19" }); // a Thursday ends the old one
  });

  it("[AC-DSH-02.1][AC-DSH-02.2] miles are the latest period between check-ins, compared with the one before", () => {
    const readings = [{ date: "2026-11-06", miles: 1000 }, { date: "2026-11-13", miles: 1150 }, { date: "2026-11-20", miles: 1220 }];
    expect(weeklySummary({ ...none, readings }, today).miles).toEqual({ current: 70, previous: 150, periodEnd: "2026-11-20", days: 7 });
  });

  it("[AC-DSH-02.3] miles from a period that ended before last week are not shown as this week's", () => {
    const old = [{ date: "2026-10-02", miles: 900 }, { date: "2026-10-09", miles: 1000 }];
    expect(weeklySummary({ ...none, readings: old }, today).miles).toEqual({ current: undefined, previous: undefined, periodEnd: undefined, days: undefined });
  });

  it("[AC-DSH-02.3] with fewer than two check-ins there are no miles, and with two there is nothing to compare with", () => {
    expect(weeklySummary({ ...none, readings: [{ date: "2026-11-20", miles: 1220 }] }, today).miles.current).toBeUndefined();
    const two = weeklySummary({ ...none, readings: [{ date: "2026-11-13", miles: 1150 }, { date: "2026-11-20", miles: 1220 }] }, today).miles;
    expect(two.current).toBe(70);
    expect(two.previous).toBeUndefined();
  });

  it("[AC-DSH-02.1][AC-DSH-02.2] counts workouts Friday to Thursday, this week and the week before", () => {
    const workouts = [
      { date: "2026-11-20", minutes: 30 },
      { date: "2026-11-23", minutes: null, reps: 50 },
      { date: "2026-11-19", minutes: 20 }, // Thursday: last week
      { date: "2026-11-13", minutes: 20 }, // Friday: last week
      { date: "2026-11-12", minutes: 20 }, // two weeks ago
    ];
    expect(weeklySummary({ ...none, workouts }, today).workouts).toEqual({ current: 2, previous: 2 });
  });

  it("[AC-DSH-02.3] a week with no workouts is no data, not a zero", () => {
    expect(weeklySummary({ ...none, workouts: [{ date: "2026-11-01", minutes: 10 }] }, today).workouts).toEqual({ current: undefined, previous: undefined });
  });

  it("[AC-DSH-02.1][AC-DSH-02.2] gives the weight change of the trend this week and the week before, and no data without a week of history", () => {
    const weights = [
      { date: "2026-11-05", pounds: 180 },
      { date: "2026-11-12", pounds: 179 },
      { date: "2026-11-19", pounds: 178 },
      { date: "2026-11-24", pounds: 177 },
    ];
    const { weightChange } = weeklySummary({ ...none, weights }, today);
    expect(weightChange.current).toBeLessThan(0);
    expect(weightChange.previous).toBeLessThan(0);
    // An old weight does not pass for this week: nothing weighed since Friday means no data.
    expect(weeklySummary({ ...none, weights: weights.slice(0, 3) }, today).weightChange.current).toBeUndefined();
    expect(weeklySummary({ ...none, weights: [{ date: "2026-11-24", pounds: 177 }] }, today).weightChange).toEqual({ current: undefined, previous: undefined });
  });

  it("[AC-DSH-02.1][AC-DSH-02.2] adds regular and special giving by the date given, in whole cents", () => {
    const result = weeklySummary({ ...none, gifts: [gift("2026-11-22", 15_000), gift("2026-11-14", 12_000)], special: [special("2026-11-21", 2_500), special("2026-10-01", 9_000)] }, today).givingCents;
    expect(result).toEqual({ current: 17_500, previous: 12_000 });
  });

  it("[AC-DSH-02.3] a week with no gifts is no data, not a zero", () => {
    expect(weeklySummary({ ...none, gifts: [gift("2026-10-02", 15_000)] }, today).givingCents).toEqual({ current: undefined, previous: undefined });
  });

  it("[AC-DSH-02.3] nothing at all gives no data for every figure", () => {
    const s = weeklySummary(none, today);
    expect([s.miles.current, s.workouts.current, s.weightChange.current, s.givingCents.current]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("[AC-DSH-02.1] rejects a date that is not a calendar date", () => {
    expect(() => weeklySummary(none, "2026-13-01")).toThrow(/Not a calendar date/);
  });

  it("[AC-DSH-02.1] the order of the lists does not change the result", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ day: fc.integer({ min: 1, max: 28 }), cents: fc.integer({ min: 0, max: 100_000 }) }), { maxLength: 12 }), (list) => {
        const gifts = list.map((g) => gift(`2026-11-${String(g.day).padStart(2, "0")}`, g.cents));
        expect(weeklySummary({ ...none, gifts }, today).givingCents).toEqual(weeklySummary({ ...none, gifts: [...gifts].reverse() }, today).givingCents);
      }),
    );
  });
});
