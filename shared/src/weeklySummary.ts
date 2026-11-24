// The "This week" card on Home (DSH-02). Pure: the caller passes the lists Home already has and today's date.
// Weeks run Friday to Thursday (ADR-0008). Every figure is compared with the week before, and a week with nothing
// to report is `undefined`, never a zero that could be mistaken for a real value (AC-DSH-02.3).
import { weeklyMiles, type OdometerReading } from "./mileage.js";
import { weightSummary, type WeightEntry } from "./weight.js";
import { workoutsThisWeek, type Workout } from "./workouts.js";
import type { RegularGift, SpecialContribution } from "./giving.js";

const MS_PER_DAY = 86_400_000;
const FRIDAY = 5;

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
function fridayOf(day: number): number {
  const weekday = new Date(day * MS_PER_DAY).getUTCDay();
  return day - ((weekday - FRIDAY + 7) % 7);
}

/** A figure for this week and for the week before. A value is undefined when there is no data for that week. */
export interface Figure<T> {
  current: T | undefined;
  previous: T | undefined;
}

export interface WeeklySummary {
  /** The Friday this week started, and the Thursday it ends on. */
  weekStart: string;
  weekEnd: string;
  /** Miles of the latest period between check-ins (the miles driven in the week that ended with this week's or last week's reading), and the period before it. No data when that period ended earlier than last week. */
  miles: Figure<number> & { periodEnd: string | undefined; days: number | undefined };
  /** Number of workouts logged. */
  workouts: Figure<number>;
  /** How the weight trend moved over the last week (pounds, negative is down), this week and the week before. A week counts only if a weight was logged in it. */
  weightChange: Figure<number>;
  /** Regular and special giving, by the date given, in integer cents. */
  givingCents: Figure<number>;
}

function sumGiving(gifts: readonly RegularGift[], special: readonly SpecialContribution[], start: number): number | undefined {
  let total = 0;
  let found = false;
  for (const { dateGiven, cents } of [...gifts, ...special]) {
    const day = toDayNumber(dateGiven);
    if (day >= start && day < start + 7) {
      total += cents;
      found = true;
    }
  }
  return found ? total : undefined;
}

export function weeklySummary(
  input: { readings: readonly OdometerReading[]; workouts: readonly Workout[]; weights: readonly WeightEntry[]; gifts: readonly RegularGift[]; special: readonly SpecialContribution[] },
  today: string,
): WeeklySummary {
  const start = fridayOf(toDayNumber(today));
  const previousStart = start - 7;

  const periods = weeklyMiles(input.readings);
  const last = periods[periods.length - 1];
  const before = periods[periods.length - 2];

  const workoutCount = (from: number): number | undefined => {
    const count = workoutsThisWeek(input.workouts, toDate(from), { weekStartsOn: FRIDAY }).count;
    return count === 0 ? undefined : count;
  };

  // The weight change counts for a week only when something was weighed in that week, so an old entry never passes for this week.
  const changeIn = (from: number): number | undefined => {
    if (!input.weights.some((entry) => toDayNumber(entry.date) >= from && toDayNumber(entry.date) < from + 7)) return undefined;
    return weightSummary(input.weights.filter((entry) => toDayNumber(entry.date) < from + 7))?.changePounds;
  };
  // The miles of the latest period count only while that period ended this week or last week (this week's reading may not be in yet).
  const recent = last !== undefined && toDayNumber(last.to) >= previousStart;

  return {
    weekStart: toDate(start),
    weekEnd: toDate(start + 6),
    miles: { current: recent ? last.miles : undefined, previous: recent ? before?.miles : undefined, periodEnd: recent ? last.to : undefined, days: recent ? last.days : undefined },
    workouts: { current: workoutCount(start), previous: workoutCount(previousStart) },
    weightChange: { current: changeIn(start), previous: changeIn(previousStart) },
    givingCents: { current: sumGiving(input.gifts, input.special, start), previous: sumGiving(input.gifts, input.special, previousStart) },
  };
}
