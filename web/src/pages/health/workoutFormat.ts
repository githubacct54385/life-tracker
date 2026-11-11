import { MAX_WORKOUT_MINUTES, type WorkoutSource } from "@life-tracker/shared";

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
