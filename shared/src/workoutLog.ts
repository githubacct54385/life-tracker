import { z } from "zod";

// Request and response shapes for the workout endpoints (HLT-02). Used by the API client, the demo API and the Worker.
// Named workoutLog (not workouts) because workouts.ts holds the pure totals and streak maths (HLT-04).

/** The workout types offered on the screen. The database only requires a short non-empty text, so imports can bring others. */
export const WORKOUT_TYPES = ["Run", "Walk", "Cycle", "Swim", "Strength", "Yoga", "Hike", "Other"] as const;
export const MAX_WORKOUT_MINUTES = 1440;
export const MAX_WORKOUT_NOTE_LENGTH = 500;
export const MAX_WORKOUT_TYPE_LENGTH = 40;

export const workoutSourceSchema = z.enum(["manual", "apple_watch"]);
export type WorkoutSource = z.infer<typeof workoutSourceSchema>;

const typeSchema = z.string().trim().min(1).max(MAX_WORKOUT_TYPE_LENGTH);
const minutesSchema = z.number().int().min(1).max(MAX_WORKOUT_MINUTES);

export const workoutRecordSchema = z.object({
  id: z.number().int().positive(),
  /** Calendar date, "YYYY-MM-DD". Set by the server when a manual workout is saved. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: typeSchema,
  minutes: minutesSchema,
  note: z.string().max(MAX_WORKOUT_NOTE_LENGTH).nullable(),
  source: workoutSourceSchema,
});
export type WorkoutRecord = z.infer<typeof workoutRecordSchema>;

/** Body of POST /api/workouts and PUT /api/workouts/:id. There is deliberately no date field (AC-HLT-02.1). */
export const saveWorkoutRequestSchema = z
  .object({
    type: typeSchema,
    minutes: minutesSchema,
    note: z.string().trim().max(MAX_WORKOUT_NOTE_LENGTH).optional(),
  })
  .strict();
export type SaveWorkoutRequest = z.infer<typeof saveWorkoutRequestSchema>;

export const workoutListResponseSchema = z.object({ workouts: z.array(workoutRecordSchema) });
export type WorkoutListResponse = z.infer<typeof workoutListResponseSchema>;
