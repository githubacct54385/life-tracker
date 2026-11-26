import { z } from "zod";

// The weekly workout goal (HLT-05): how many workouts a week the person is aiming for. One number per person.
export const MIN_WORKOUT_GOAL = 1;
export const MAX_WORKOUT_GOAL = 14;

const perWeek = z.number().int().min(MIN_WORKOUT_GOAL).max(MAX_WORKOUT_GOAL);

/** Body of PUT /api/workouts/goal. */
export const saveWorkoutGoalRequestSchema = z.object({ perWeek }).strict();
export type SaveWorkoutGoalRequest = z.infer<typeof saveWorkoutGoalRequestSchema>;

/** Response of GET and PUT /api/workouts/goal. `perWeek` is null until a goal is set. */
export const workoutGoalSchema = z.object({ perWeek: perWeek.nullable() });
export type WorkoutGoal = z.infer<typeof workoutGoalSchema>;
