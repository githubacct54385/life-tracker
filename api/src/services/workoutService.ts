// Business rules for manually logged workouts (HLT-02). A manual workout is dated when it is saved (AC-HLT-02.1),
// so the caller never supplies a date. Nothing here touches SQL.
import type { SaveWorkoutRequest } from "@life-tracker/shared";
import { workoutRepository, type StoredWorkout, type WorkoutRepository } from "../repositories/workoutRepository.js";
import { calendarDateIn, DEFAULT_OWNER_TIME_ZONE } from "./odometerService.js";

export interface WorkoutService {
  list(limit?: number): Promise<StoredWorkout[]>;
  /** A new manual workout, dated now. */
  log(input: SaveWorkoutRequest): Promise<StoredWorkout>;
  /** Changes type, duration and note. Keeps the date and the source. Undefined when it does not exist. */
  edit(id: number, input: SaveWorkoutRequest): Promise<StoredWorkout | undefined>;
  /** Removes a workout for good. False when it does not exist. */
  remove(id: number): Promise<boolean>;
}

export interface WorkoutServiceOptions {
  now?: () => Date;
  timeZone?: string;
}

const noteOrNull = (note: string | undefined) => (note === undefined || note.trim() === "" ? null : note.trim());

export function createWorkoutService(repo: WorkoutRepository, options: WorkoutServiceOptions = {}): WorkoutService {
  const now = options.now ?? (() => new Date());
  const timeZone = options.timeZone ?? DEFAULT_OWNER_TIME_ZONE;

  return {
    list: (limit = 100) => repo.list(limit),

    log: ({ type, minutes, note }) =>
      repo.insert({ date: calendarDateIn(timeZone, now()), type, minutes, note: noteOrNull(note), source: "manual" }),

    edit: (id, { type, minutes, note }) => repo.update(id, { type, minutes, note: noteOrNull(note) }),

    remove: (id) => repo.remove(id),
  };
}

export const workoutService = createWorkoutService(workoutRepository);
