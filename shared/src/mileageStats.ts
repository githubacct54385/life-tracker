// Totals and trends over the periods from `weeklyMiles` (MIL-03). Pure: no clock, no time zone, no I/O.
// A period belongs to the month and year of the reading that ends it, so every mile is counted exactly once.
import type { MilesPeriod } from "./mileage.js";

/** How many periods the rolling average looks at. */
export const ROLLING_WINDOW = 8;

/** Periods of more than this many days cover a missed week (a late Saturday reading makes 8). */
const MAX_SINGLE_WEEK_DAYS = 8;

export interface MonthTotal {
  /** "YYYY-MM" */
  month: string;
  miles: number;
}

export interface YearTotal {
  /** "YYYY" */
  year: string;
  miles: number;
}

/**
 * For each period, the average miles per week over it and the 7 before it, or undefined until 8 periods exist.
 * It is miles divided by days times 7, so a 14-day period counts as two weeks and a missed week cannot inflate it.
 */
export function rollingAverages(periods: readonly MilesPeriod[]): (number | undefined)[] {
  return periods.map((_, index) => {
    if (index + 1 < ROLLING_WINDOW) return undefined;
    const window = periods.slice(index + 1 - ROLLING_WINDOW, index + 1);
    const miles = window.reduce((sum, period) => sum + period.miles, 0);
    const days = window.reduce((sum, period) => sum + period.days, 0);
    return days === 0 ? undefined : (miles / days) * 7;
  });
}

function totalsBy(periods: readonly MilesPeriod[], keyLength: number): Map<string, number> {
  const totals = new Map<string, number>();
  for (const period of periods) {
    const key = period.to.slice(0, keyLength);
    totals.set(key, (totals.get(key) ?? 0) + period.miles);
  }
  return totals;
}

const sortedEntries = (totals: Map<string, number>) => [...totals.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/** Miles per calendar month, oldest first. Months with no period are left out. */
export function monthlyTotals(periods: readonly MilesPeriod[]): MonthTotal[] {
  return sortedEntries(totalsBy(periods, 7)).map(([month, miles]) => ({ month, miles }));
}

/** Miles per calendar year, oldest first. */
export function yearlyTotals(periods: readonly MilesPeriod[]): YearTotal[] {
  return sortedEntries(totalsBy(periods, 4)).map(([year, miles]) => ({ year, miles }));
}

/**
 * The single-week periods with the most and fewest miles. A period that spans a missed week holds two weeks of
 * driving, so it is not compared with one-week periods. On a tie the earlier week wins. Undefined with no such period.
 */
export function busiestAndQuietest(periods: readonly MilesPeriod[]): { busiest: MilesPeriod; quietest: MilesPeriod } | undefined {
  const weeks = periods.filter((period) => period.days <= MAX_SINGLE_WEEK_DAYS);
  const first = weeks[0];
  if (!first) return undefined;
  let busiest = first;
  let quietest = first;
  for (const period of weeks) {
    if (period.miles > busiest.miles) busiest = period;
    if (period.miles < quietest.miles) quietest = period;
  }
  return { busiest, quietest };
}
