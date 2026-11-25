// Test support only (used by *.int.test.ts): helpers for the workouts table on the throwaway database from odometerTestDatabase.ts.
import { getPool } from "../db/connection.js";
import { testOwnerId } from "./personTestDatabase.js";

export async function clearWorkouts(): Promise<void> {
  await getPool().query("DELETE FROM workouts");
  await getPool().query("DELETE FROM workout_goals");
}

export async function seedWorkout(date: string, type: string, minutes: number | null, source: "manual" | "apple_watch", reps: number | null = null): Promise<void> {
  await getPool().query("INSERT INTO workouts (workout_date, workout_type, minutes, reps, source, user_id) VALUES ($1::date, $2, $3, $4, $5, $6)", [date, type, minutes, reps, source, await testOwnerId()]);
}

/** Writes a goal straight to the table, past the service and handler, to prove the database's own rule. */
export async function seedWorkoutGoal(perWeek: number): Promise<void> {
  await getPool().query("INSERT INTO workout_goals (user_id, per_week) VALUES ($1, $2)", [await testOwnerId(), perWeek]);
}
