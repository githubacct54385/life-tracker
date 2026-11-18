import { describe, expect, it } from "vitest";
import { saveWorkoutRequestSchema, WORKOUT_TYPES, workoutRecordSchema } from "./workoutLog";

describe("saveWorkoutRequestSchema", () => {
  it("[AC-HLT-02.1] accepts a type and duration with an optional note", () => {
    expect(saveWorkoutRequestSchema.safeParse({ type: "Run", minutes: 30 }).success).toBe(true);
    expect(saveWorkoutRequestSchema.safeParse({ type: "Run", minutes: 30, note: "easy pace" }).success).toBe(true);
  });

  it("[AC-HLT-02.1] never accepts a date or time", () => {
    expect(saveWorkoutRequestSchema.safeParse({ type: "Run", minutes: 30, date: "2026-01-01" }).success).toBe(false);
    expect(saveWorkoutRequestSchema.safeParse({ type: "Run", minutes: 30, source: "apple_watch" }).success).toBe(false);
  });

  it("[AC-HLT-02.1] rejects an empty type and a duration that is not whole minutes from 1 to 1440", () => {
    for (const bad of [{ type: " ", minutes: 30 }, { type: "Run", minutes: 0 }, { type: "Run", minutes: 1441 }, { type: "Run", minutes: 12.5 }]) {
      expect(saveWorkoutRequestSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("workoutRecordSchema", () => {
  it("[AC-HLT-02.3] carries the source", () => {
    const base = { id: 1, date: "2026-11-13", type: "Run", minutes: 30, reps: null, note: null };
    expect(workoutRecordSchema.safeParse({ ...base, source: "manual" }).success).toBe(true);
    expect(workoutRecordSchema.safeParse({ ...base, source: "apple_watch" }).success).toBe(true);
    expect(workoutRecordSchema.safeParse({ ...base, source: "other" }).success).toBe(false);
    expect(workoutRecordSchema.safeParse(base).success).toBe(false);
  });
});

describe("pushups", () => {
  it("[AC-HLT-02.4] a pushups request needs a whole count from 1 to 10,000 and no minutes", () => {
    expect(saveWorkoutRequestSchema.safeParse({ type: "Pushups", reps: 40 }).success).toBe(true);
    expect(saveWorkoutRequestSchema.safeParse({ type: "Pushups", reps: 40, note: "sets of 10" }).success).toBe(true);
    for (const bad of [{ type: "Pushups" }, { type: "Pushups", reps: 0 }, { type: "Pushups", reps: 10_001 }, { type: "Pushups", reps: 2.5 }, { type: "Pushups", reps: 40, minutes: 5 }, { type: "Pushups", minutes: 5 }]) {
      expect(saveWorkoutRequestSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("[AC-HLT-02.4] every other type still needs minutes and takes no count", () => {
    expect(saveWorkoutRequestSchema.safeParse({ type: "Run", minutes: 30 }).success).toBe(true);
    for (const bad of [{ type: "Run" }, { type: "Run", reps: 20 }, { type: "Run", minutes: 30, reps: 20 }, { type: "Other", reps: 3 }]) {
      expect(saveWorkoutRequestSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("[AC-HLT-02.4] Pushups is one of the types offered, and a record may carry reps in place of minutes", () => {
    expect(WORKOUT_TYPES).toContain("Pushups");
    const record = { id: 1, date: "2026-11-13", type: "Pushups", minutes: null, reps: 40, note: null, source: "manual" };
    expect(workoutRecordSchema.safeParse(record).success).toBe(true);
  });
});
