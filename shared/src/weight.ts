// Weight trend and unit conversion (HLT-01). Pure: no clock, no I/O.
// Weights are stored in pounds (ADR-0007); the owner setting only changes entry and display.

export interface WeightEntry {
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  pounds: number;
}

export interface TrendPoint extends WeightEntry {
  /** Average of the entries from the previous `days - 1` days up to and including this date, to 0.1 lb. */
  trendPounds: number;
}

export type WeightUnit = "lb" | "kg";

/** A moving average over the last seven days smooths day-to-day noise. Callers can pass another length. */
export const DEFAULT_TREND_DAYS = 7;

const POUNDS_PER_KILOGRAM = 2.2046226218;
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

const roundTenth = (value: number) => Math.round(value * 10) / 10;

function checkWeight(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Weight in ${label} must be a positive number: ${value}`);
}

/** Moving-average trend for each entry, oldest first. Only one entry per day is allowed (AC-HLT-01.3). */
export function weightTrend(entries: readonly WeightEntry[], options: { days?: number } = {}): TrendPoint[] {
  const days = options.days ?? DEFAULT_TREND_DAYS;
  if (!Number.isInteger(days) || days < 1) throw new Error(`Trend window in days must be a whole number of at least 1: ${days}`);
  const dated = entries.map((entry) => {
    checkWeight(entry.pounds, "pounds");
    return { entry, day: toDayNumber(entry.date) };
  });
  dated.sort((a, b) => a.day - b.day);
  for (let i = 1; i < dated.length; i++) {
    if (dated[i]!.day === dated[i - 1]!.day) throw new Error("Only one entry per day is allowed");
  }
  return dated.map(({ entry, day }) => {
    const inWindow = dated.filter((other) => other.day <= day && other.day > day - days);
    const average = inWindow.reduce((sum, other) => sum + other.entry.pounds, 0) / inWindow.length;
    return { date: entry.date, pounds: entry.pounds, trendPounds: roundTenth(average) };
  });
}

/** The saved entry a new one for `date` would replace, if any. The screen asks before replacing it. */
export function findSameDay(entries: readonly WeightEntry[], date: string): WeightEntry | undefined {
  const day = toDayNumber(date);
  return entries.find((entry) => toDayNumber(entry.date) === day);
}

/** Pounds to the unit the owner chose, to 0.1. */
export function fromPounds(pounds: number, unit: WeightUnit): number {
  checkWeight(pounds, "pounds");
  return roundTenth(unit === "kg" ? pounds / POUNDS_PER_KILOGRAM : pounds);
}

/** A value entered in the owner's unit, as pounds to 0.1 for storage. */
export function toPounds(value: number, unit: WeightUnit): number {
  checkWeight(value, unit === "kg" ? "kilograms" : "pounds");
  return roundTenth(unit === "kg" ? value * POUNDS_PER_KILOGRAM : value);
}
