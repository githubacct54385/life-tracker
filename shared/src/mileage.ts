// Weekly mileage from odometer readings (ADR-0008, MIL-02). Pure: no clock, no time zone, no I/O.
// Dates are plain calendar dates ("YYYY-MM-DD", ADR-0007). They are turned into day numbers so no time zone or
// daylight-saving shift can move a reading to another day.

export interface OdometerReading {
  /** Calendar date, "YYYY-MM-DD". */
  date: string;
  miles: number;
}

export interface WeekMiles {
  /** The Friday the week starts on. */
  start: string;
  /** The Thursday the week ends on (start + 6 days). */
  end: string;
  /** Odometer change from this Friday to the next. */
  miles: number;
  /** True when either Friday value was interpolated instead of read. */
  estimated: boolean;
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

function toDate(dayNumber: number): string {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

const isFriday = (dayNumber: number) => new Date(dayNumber * MS_PER_DAY).getUTCDay() === FRIDAY;

/**
 * Miles per Friday-to-Thursday week.
 *
 * Each Friday between the first and last reading gets an odometer value: the reading itself if one was taken that day,
 * otherwise a straight-line value by date between the nearest readings on either side (readings on any weekday count).
 * Nothing is extrapolated, so no week is reported before the first reading or after the last one.
 * Two readings on one date keep the higher value, so the result never depends on the order readings were entered.
 * The input is not changed. Weeks come back oldest first.
 */
export function weeklyMiles(readings: readonly OdometerReading[]): WeekMiles[] {
  // One value per day, ascending by day.
  const byDay = new Map<number, number>();
  for (const { date, miles } of readings) {
    const day = toDayNumber(date);
    byDay.set(day, Math.max(byDay.get(day) ?? -Infinity, miles));
  }
  const points = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return [];

  // Friday values, walking forward through the readings once.
  const fridays: { day: number; miles: number; estimated: boolean }[] = [];
  let i = 0;
  for (let day = first[0]; day <= last[0]; day++) {
    if (!isFriday(day)) continue;
    while (points[i + 1] && points[i + 1]![0] <= day) i++;
    const [beforeDay, beforeMiles] = points[i]!;
    if (beforeDay === day) {
      fridays.push({ day, miles: beforeMiles, estimated: false });
    } else {
      const [afterDay, afterMiles] = points[i + 1]!; // exists: day < last[0]
      const share = (day - beforeDay) / (afterDay - beforeDay);
      fridays.push({ day, miles: beforeMiles + (afterMiles - beforeMiles) * share, estimated: true });
    }
  }

  return fridays.slice(1).map((end, index) => {
    const start = fridays[index]!;
    return {
      start: toDate(start.day),
      end: toDate(end.day - 1),
      miles: end.miles - start.miles,
      estimated: start.estimated || end.estimated,
    };
  });
}
