import type { WorkoutSource } from "@life-tracker/shared";
import { getPool } from "../db/connection.js";

export interface StoredWorkout {
  id: number;
  /** Calendar date, "YYYY-MM-DD". */
  date: string;
  type: string;
  /** Null for a workout counted in repetitions (pushups). */
  minutes: number | null;
  reps: number | null;
  note: string | null;
  source: WorkoutSource;
}

interface Row {
  id: string;
  date: string;
  type: string;
  minutes: number | null;
  reps: number | null;
  note: string | null;
  source: WorkoutSource;
}

const toWorkout = (row: Row): StoredWorkout => ({ ...row, id: Number(row.id) });

// workout_date is formatted in SQL so the driver never turns a calendar date into a time-zone-shifted Date.
const COLUMNS = "id, to_char(workout_date, 'YYYY-MM-DD') AS date, workout_type AS type, minutes, reps, note, source";

/** SQL for workouts. No business rules: those live in services/workoutService.ts. */
export interface WorkoutRepository {
  /** Newest first. */
  list(limit: number): Promise<StoredWorkout[]>;
  insert(workout: Omit<StoredWorkout, "id">): Promise<StoredWorkout>;
  /** Changes type, minutes, reps and note only; the date and source are never touched. Undefined when there is no such workout. */
  update(id: number, fields: { type: string; minutes: number | null; reps: number | null; note: string | null }): Promise<StoredWorkout | undefined>;
  /** True when a workout was removed. */
  remove(id: number): Promise<boolean>;
}

export const workoutRepository: WorkoutRepository = {
  async list(limit) {
    const result = await getPool().query<Row>(`SELECT ${COLUMNS} FROM workouts ORDER BY workout_date DESC, id DESC LIMIT $1`, [limit]);
    return result.rows.map(toWorkout);
  },

  async insert({ date, type, minutes, reps, note, source }) {
    const result = await getPool().query<Row>(
      `INSERT INTO workouts (workout_date, workout_type, minutes, reps, note, source) VALUES ($1::date, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
      [date, type, minutes, reps, note, source],
    );
    return toWorkout(result.rows[0]!);
  },

  async update(id, { type, minutes, reps, note }) {
    const result = await getPool().query<Row>(
      `UPDATE workouts SET workout_type = $2, minutes = $3, reps = $4, note = $5, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, type, minutes, reps, note],
    );
    return result.rows[0] ? toWorkout(result.rows[0]) : undefined;
  },

  async remove(id) {
    const result = await getPool().query("DELETE FROM workouts WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
