import { isRepWorkout, MAX_WORKOUT_MINUTES, MAX_WORKOUT_REPS, type WorkoutSource } from "@life-tracker/shared";

export const SOURCE_LABELS: Record<WorkoutSource, string> = { manual: "Manual", apple_watch: "Apple Watch" };

/** What the owner typed -> whole minutes, or undefined when it is not a usable duration. */
export function parseMinutes(text: string): number | undefined {
  const cleaned = text.trim();
  if (!/^\d{1,4}$/.test(cleaned)) return undefined;
  const minutes = Number(cleaned);
  return minutes >= 1 && minutes <= MAX_WORKOUT_MINUTES ? minutes : undefined;
}

/** 95 -> "1 h 35 min"; 30 -> "30 min". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** What the owner typed -> a whole count, or undefined when it is not usable (1 to 10,000). */
export function parseReps(text: string): number | undefined {
  const cleaned = text.trim().replace(/,/g, "");
  if (!/^\d{1,5}$/.test(cleaned)) return undefined;
  const reps = Number(cleaned);
  return reps >= 1 && reps <= MAX_WORKOUT_REPS ? reps : undefined;
}

const UNITS: Record<string, [string, string]> = { Pushups: ["pushup", "pushups"] };

/** 1 -> "1 pushup"; 40 -> "40 pushups"; for a type with no name of its own, "40 reps". */
export function formatReps(reps: number, type: string): string {
  const [one, many] = UNITS[type] ?? ["rep", "reps"];
  return `${reps.toLocaleString("en-US")} ${reps === 1 ? one : many}`;
}

/** "30 min" for a timed workout, "40 pushups" for one that is counted. */
export function describeAmount(workout: { type: string; minutes: number | null; reps: number | null }): string {
  if (workout.reps !== null) return formatReps(workout.reps, workout.type);
  return workout.minutes === null ? "" : formatMinutes(workout.minutes);
}

/** The form's duration or count text, read the way the chosen type needs it. Undefined while it is not usable. */
export function amountFromForm(type: string, form: { minutes: string; reps: string }): { minutes: number } | { reps: number } | undefined {
  if (isRepWorkout(type)) {
    const reps = parseReps(form.reps);
    return reps === undefined ? undefined : { reps };
  }
  const minutes = parseMinutes(form.minutes);
  return minutes === undefined ? undefined : { minutes };
}
