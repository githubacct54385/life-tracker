// Weekly mileage from odometer readings (ADR-0008 as amended 2026-11-10, MIL-02). Pure: no clock, no time zone, no I/O.
// Nothing is guessed. Each Friday-to-Thursday week has at most one "check-in": its earliest reading. A reading taken
// on Saturday still counts for that week (the gap is then 8 days). A week with no reading is reported as missing so the
// app can ask for it. Dates are plain calendar dates ("YYYY-MM-DD", ADR-0007) turned into day numbers, so no time zone
// or daylight-saving shift can move a reading to another day.

export interface OdometerReading {
  /** Calendar date, "YYYY-MM-DD". */
  date: string;
  miles: number;
}

/** The miles driven between two consecutive check-ins. */
export interface MilesPeriod {
  /** Date of the earlier check-in reading. */
  from: string;
  /** Date of the later check-in reading. */
  to: string;
  /** Days between the two readings: 7 for two Fridays, 8 when one was taken on Saturday, and so on. */
  days: number;
  /** Odometer change between the two readings. */
  miles: number;
  /** Friday of the week this period ends in. */
  weekStart: string;
  /** Weeks with no reading inside this period (0 normally). The gap is simply longer, never filled in. */
  missedWeeks: number;
}

const MS_PER_DAY = 86_400_000;
const FRIDAY = 5; // Date#getUTCDay: Sunday is 0

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

/** One check-in per week: the earliest reading in it. Two readings on one date keep the higher value (order never matters). */
function checkIns(readings: readonly OdometerReading[]): { week: number; day: number; miles: number }[] {
  const byWeek = new Map<number, { week: number; day: number; miles: number }>();
  for (const { date, miles } of readings) {
    const day = toDayNumber(date);
    const week = fridayOf(day);
    const current = byWeek.get(week);
    if (!current || day < current.day || (day === current.day && miles > current.miles)) byWeek.set(week, { week, day, miles });
  }
  return [...byWeek.values()].sort((a, b) => a.week - b.week);
}

/** Miles between each pair of consecutive check-ins, oldest first. Needs two check-ins; fewer gives an empty list. */
export function weeklyMiles(readings: readonly OdometerReading[]): MilesPeriod[] {
  const list = checkIns(readings);
  return list.slice(1).map((to, index) => {
    const from = list[index]!;
    return {
      from: toDate(from.day),
      to: toDate(to.day),
      days: to.day - from.day,
      miles: to.miles - from.miles,
      weekStart: toDate(to.week),
      missedWeeks: (to.week - from.week) / 7 - 1,
    };
  });
}

/**
 * Fridays that start a week with no reading, from the week of the first reading up to and including the week that
 * contains `today`, oldest first. The app asks the owner to add these. A reading added later (even a day or two late)
 * fills the gap with no guessing and no other week changing.
 */
export function missingWeeks(readings: readonly OdometerReading[], today: string): string[] {
  const list = checkIns(readings);
  const first = list[0];
  if (!first) return [];
  const have = new Set(list.map((c) => c.week));
  const missing: string[] = [];
  for (let week = first.week; week <= fridayOf(toDayNumber(today)); week += 7) {
    if (!have.has(week)) missing.push(toDate(week));
  }
  return missing;
}
