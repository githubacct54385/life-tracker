// Workout totals and consistency streaks (HLT-04). Pure: no clock (callers pass `today`), no time zone, no I/O.
// Dates are plain local calendar dates "YYYY-MM-DD" (ADR-0007), converted to day numbers so nothing shifts across zones.

export interface Workout {
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  minutes: number;
}

export interface WorkoutTotal {
  /** Week: the date the week starts on. Month: "YYYY-MM". */
  period: string;
  count: number;
  minutes: number;
}

export interface WeekOptions {
  /** 0 = Sunday ... 6 = Saturday. Default 1 (Monday). */
  weekStartsOn?: number;
}

const MS_PER_DAY = 86_400_000;

function toDayNumber(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const [y, m, d] = match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [NaN, NaN, NaN];
  const ms = Date.UTC(y, m - 1, d);
  const check = new Date(ms);
  if (!match || check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error(`Not a calendar date (expected YYYY-MM-DD): ${JSON.stringify(date)}`);
  }
  return ms / MS_PER_DAY;
}

const toDate = (dayNumber: number) => new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);

/** Day number of the first day of the week that contains `day`. */
function weekStart(day: number, weekStartsOn: number): number {
  const weekday = new Date(day * MS_PER_DAY).getUTCDay();
  return day - ((weekday - weekStartsOn + 7) % 7);
}

/** Count and minutes per week or per calendar month, newest period first. Periods with no workouts are left out. */
export function workoutTotals(workouts: readonly Workout[], by: "week" | "month", options: WeekOptions = {}): WorkoutTotal[] {
  const weekStartsOn = options.weekStartsOn ?? 1;
  const totals = new Map<string, WorkoutTotal>();
  for (const { date, minutes } of workouts) {
    const day = toDayNumber(date);
    const period = by === "week" ? toDate(weekStart(day, weekStartsOn)) : toDate(day).slice(0, 7);
    const entry = totals.get(period) ?? { period, count: 0, minutes: 0 };
    entry.count += 1;
    entry.minutes += minutes;
    totals.set(period, entry);
  }
  return [...totals.values()].sort((a, b) => (a.period < b.period ? 1 : -1));
}

/**
 * Number of consecutive weeks, counting back, that each have at least `target` workouts.
 * The week containing `today` counts if it already meets the target, but while it is still short it does not
 * break the streak: the count then starts from last week. Workouts after `today` are ignored.
 */
export function weeklyStreak(workouts: readonly Workout[], options: WeekOptions & { target: number; today: string }): number {
  const { target, today } = options;
  if (!Number.isInteger(target) || target < 1) throw new Error("Streak target must be a whole number of at least 1");
  const weekStartsOn = options.weekStartsOn ?? 1;
  const todayNumber = toDayNumber(today);

  const perWeek = new Map<number, number>();
  for (const { date } of workouts) {
    const day = toDayNumber(date);
    if (day > todayNumber) continue;
    const start = weekStart(day, weekStartsOn);
    perWeek.set(start, (perWeek.get(start) ?? 0) + 1);
  }

  let week = weekStart(todayNumber, weekStartsOn);
  if ((perWeek.get(week) ?? 0) < target) week -= 7; // current week is not over yet
  let streak = 0;
  while ((perWeek.get(week) ?? 0) >= target) {
    streak += 1;
    week -= 7;
  }
  return streak;
}
