// The weekly workout chart and goal (HLT-05). Pure: no clock (callers pass `today`), no time zone, no I/O.
// Weeks run Friday to Thursday, like the rest of the app (ADR-0008). A pushup session counts as a workout and adds no minutes.

const MS_PER_DAY = 86_400_000;
const FRIDAY = 5;

export interface ChartWorkout {
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  type: string;
  /** Null for a workout counted in repetitions (pushups): it adds nothing to the minutes. */
  minutes: number | null;
}

export interface ChartWeekType {
  type: string;
  count: number;
  minutes: number;
}

export interface ChartWeek {
  /** The Friday the week starts on, and the Thursday it ends on, "YYYY-MM-DD". */
  start: string;
  end: string;
  count: number;
  minutes: number;
  /** The workout types in this week, in the order of `WeeklyWorkoutChart.types`. */
  byType: ChartWeekType[];
  /** True for the week that contains today. It is still in progress. */
  current: boolean;
}

export interface WeeklyWorkoutChart {
  /** Oldest first, ending with the current week. Weeks with no workouts are included. */
  weeks: ChartWeek[];
  /** Every workout type in the weeks shown, the most frequent first (then by name), so a type keeps its place in the stack. */
  types: string[];
  /** Workouts per week the person is aiming for, or null when no goal is set. */
  goal: number | null;
  /** Workouts still to do this week to reach the goal. 0 when it is met, null when no goal is set. */
  left: number | null;
  /** Weeks in a row that met the goal. The current week counts once it has met the goal, and never breaks the streak while it is in progress. 0 with no goal. */
  streakWeeks: number;
  /** Whether any workout falls in the weeks shown. */
  hasWorkouts: boolean;
}

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

/** Day number of the Friday that starts the week containing `day`. */
function weekStart(day: number): number {
  const weekday = new Date(day * MS_PER_DAY).getUTCDay();
  return day - ((weekday - FRIDAY + 7) % 7);
}

/**
 * The last `weeks` weeks (default 12) ending with the week that contains `today`, with the goal line and the streak.
 * Workouts after `today` are ignored. A goal must be a whole number of at least 1, or null.
 */
export function weeklyWorkoutChart(workouts: readonly ChartWorkout[], today: string, goal: number | null, weeks = 12): WeeklyWorkoutChart {
  if (goal !== null && (!Number.isInteger(goal) || goal < 1)) throw new Error("The goal must be a whole number of at least 1");
  const todayNumber = toDayNumber(today);
  const currentStart = weekStart(todayNumber);
  const firstStart = currentStart - 7 * (weeks - 1);

  const buckets = Array.from({ length: weeks }, () => ({ count: 0, minutes: 0, types: new Map<string, ChartWeekType>() }));
  const overall = new Map<string, number>();
  for (const { date, type, minutes } of workouts) {
    const day = toDayNumber(date);
    if (day > todayNumber || day < firstStart) continue;
    const bucket = buckets[Math.floor((weekStart(day) - firstStart) / 7)]!;
    const entry = bucket.types.get(type) ?? { type, count: 0, minutes: 0 };
    entry.count += 1;
    entry.minutes += minutes ?? 0;
    bucket.types.set(type, entry);
    bucket.count += 1;
    bucket.minutes += minutes ?? 0;
    overall.set(type, (overall.get(type) ?? 0) + 1);
  }

  const types = [...overall.keys()].sort((a, b) => overall.get(b)! - overall.get(a)! || a.localeCompare(b));
  const chartWeeks: ChartWeek[] = buckets.map((bucket, i) => ({
    start: toDate(firstStart + 7 * i),
    end: toDate(firstStart + 7 * i + 6),
    count: bucket.count,
    minutes: bucket.minutes,
    byType: types.filter((type) => bucket.types.has(type)).map((type) => bucket.types.get(type)!),
    current: i === weeks - 1,
  }));

  const currentCount = chartWeeks[weeks - 1]!.count;
  let streakWeeks = 0;
  if (goal !== null) {
    let i = weeks - 1;
    // The week in progress counts only when it has met the goal. Falling short so far never breaks the streak.
    if (currentCount < goal) i -= 1;
    while (i >= 0 && chartWeeks[i]!.count >= goal) {
      streakWeeks += 1;
      i -= 1;
    }
  }

  return {
    weeks: chartWeeks,
    types,
    goal,
    left: goal === null ? null : Math.max(0, goal - currentCount),
    streakWeeks,
    hasWorkouts: overall.size > 0,
  };
}
