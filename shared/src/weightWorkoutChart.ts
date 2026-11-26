import { weightTrend, type WeightEntry } from "./weight.js";
import { weeklyWorkoutChart, type ChartWorkout } from "./workoutChart.js";

// Weight next to workout effort (HLT-06): for each week, the weight moving average and the minutes worked out.
// Pure: no clock (callers pass `today`), no time zone, no I/O. Weeks run Friday to Thursday (ADR-0008).

/** The ranges the owner can pick, in months, and how many weeks each shows. */
export const WEIGHT_WORKOUT_RANGES = [3, 6, 12] as const;
export type WeightWorkoutRange = (typeof WEIGHT_WORKOUT_RANGES)[number];
export const DEFAULT_WEIGHT_WORKOUT_RANGE: WeightWorkoutRange = 6;
const WEEKS_FOR: Record<WeightWorkoutRange, number> = { 3: 13, 6: 26, 12: 52 };
/** Fewer weeks than this with a weight reading, and the chart says there is not enough data yet (AC-HLT-06.4). */
export const MIN_WEIGHT_WEEKS = 4;

export interface WeightWorkoutWeek {
  /** The Friday the week starts on, and the Thursday it ends on, "YYYY-MM-DD". */
  start: string;
  end: string;
  /** Minutes worked out. A pushup session adds none. 0 when there were no workouts: the chart then shows no bar. */
  minutes: number;
  /** The number of workouts, for the table. */
  count: number;
  /** The 7-day moving average (pounds) at the last weight reading of the week, or null when there is no reading: the line then has a gap, not a zero. */
  weightPounds: number | null;
  /** How many weight readings fall in the week. */
  readings: number;
  /** True for the week that contains today. */
  current: boolean;
}

export interface WeightWorkoutChart {
  months: WeightWorkoutRange;
  /** Oldest first, ending with the current week. */
  weeks: WeightWorkoutWeek[];
  weeksWithWeight: number;
  /** True when at least four weeks have a weight reading. Without it the chart is not drawn. */
  enoughWeight: boolean;
  /** Whether any week has minutes. */
  hasWorkouts: boolean;
}

/** The weight and workout chart for the last 3, 6 or 12 months. Readings and workouts after `today` are ignored. */
export function weightWorkoutChart(weights: readonly WeightEntry[], workouts: readonly ChartWorkout[], today: string, months: WeightWorkoutRange = DEFAULT_WEIGHT_WORKOUT_RANGE): WeightWorkoutChart {
  const workoutWeeks = weeklyWorkoutChart(workouts, today, null, WEEKS_FOR[months]).weeks;
  const trend = weightTrend(weights.filter((w) => w.date <= today));
  const weeks = workoutWeeks.map((week): WeightWorkoutWeek => {
    const inWeek = trend.filter((point) => point.date >= week.start && point.date <= week.end);
    const last = inWeek[inWeek.length - 1];
    return { start: week.start, end: week.end, minutes: week.minutes, count: week.count, weightPounds: last ? last.trendPounds : null, readings: inWeek.length, current: week.current };
  });
  const weeksWithWeight = weeks.filter((w) => w.weightPounds !== null).length;
  return { months, weeks, weeksWithWeight, enoughWeight: weeksWithWeight >= MIN_WEIGHT_WEEKS, hasWorkouts: weeks.some((w) => w.minutes > 0) };
}
