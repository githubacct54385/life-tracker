import { describe, expect, it } from "vitest";
import { fakeWorkoutRepo } from "../testing/fakeWorkoutRepository";
import { createWorkoutService } from "./workoutService";

// 2026-11-13 is a Friday. Noon UTC is 04:00 in Los Angeles on the same day.
const FRIDAY_NOON = () => new Date("2026-11-13T12:00:00Z");

describe("log", () => {
  it("[AC-HLT-02.1][AC-HLT-02.3] dates a new workout when it is saved and marks it manual", async () => {
    const repo = fakeWorkoutRepo();
    const result = await createWorkoutService(repo, { now: FRIDAY_NOON }).log({ type: "Run", minutes: 30 });
    expect(result).toEqual({ id: 1, date: "2026-11-13", type: "Run", minutes: 30, note: null, source: "manual" });
  });

  it("[AC-HLT-02.1] keeps an optional note, and treats a blank note as none", async () => {
    const service = createWorkoutService(fakeWorkoutRepo(), { now: FRIDAY_NOON });
    expect((await service.log({ type: "Yoga", minutes: 45, note: "morning class" })).note).toBe("morning class");
    expect((await service.log({ type: "Yoga", minutes: 45, note: "" })).note).toBeNull();
  });
});

describe("edit", () => {
  it("[AC-HLT-02.2] changes type, minutes and note but keeps the date and source", async () => {
    const repo = fakeWorkoutRepo([{ date: "2026-11-06", type: "Run", minutes: 30, note: null, source: "apple_watch" }]);
    const result = await createWorkoutService(repo, { now: FRIDAY_NOON }).edit(1, { type: "Walk", minutes: 50, note: "with a friend" });
    expect(result).toEqual({ id: 1, date: "2026-11-06", type: "Walk", minutes: 50, note: "with a friend", source: "apple_watch" });
  });

  it("[AC-HLT-02.2] answers undefined for a workout that does not exist", async () => {
    expect(await createWorkoutService(fakeWorkoutRepo()).edit(9, { type: "Run", minutes: 5 })).toBeUndefined();
  });
});

describe("remove and list", () => {
  it("[AC-HLT-02.2] removes a workout for good, and says so when it was not there", async () => {
    const repo = fakeWorkoutRepo([{ date: "2026-11-06", type: "Run", minutes: 30, note: null, source: "manual" }]);
    const service = createWorkoutService(repo);
    expect(await service.remove(1)).toBe(true);
    expect(await service.remove(1)).toBe(false);
    expect(repo.rows).toHaveLength(0);
  });

  it("[AC-HLT-02.3] lists newest first with each workout's source", async () => {
    const repo = fakeWorkoutRepo([
      { date: "2026-11-05", type: "Run", minutes: 30, note: null, source: "apple_watch" },
      { date: "2026-11-06", type: "Yoga", minutes: 40, note: null, source: "manual" },
    ]);
    const list = await createWorkoutService(repo).list();
    expect(list.map((w) => [w.date, w.source])).toEqual([["2026-11-06", "manual"], ["2026-11-05", "apple_watch"]]);
  });
});
