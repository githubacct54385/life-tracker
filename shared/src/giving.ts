// Giving totals (GIV-03). Pure: no clock (callers pass `today`), no I/O. Money is integer cents (ADR-0007).

export interface RegularGift {
  /** Date the gift was given, "YYYY-MM-DD". */
  dateGiven: string;
  /** The month the gift is for, "YYYY-MM". It can differ from the date given. */
  forMonth: string;
  cents: number;
}

export interface SpecialContribution {
  dateGiven: string;
  /** Name or occasion, instead of a "for" month. */
  occasion: string;
  cents: number;
}

export interface MonthGiving {
  month: string;
  cents: number;
  count: number;
  /** True for a month that has begun, from the first month with any regular gift ever, that has no regular gift. */
  noGift: boolean;
}

export interface YearGiving {
  regularCents: number;
  specialCents: number;
  combinedCents: number;
}

function checkCents(cents: number): void {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`Amount must be a whole number of cents, zero or more: ${cents}`);
}

function checkMonth(month: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Not a month (expected YYYY-MM): ${JSON.stringify(month)}`);
}

function checkDate(date: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const d = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : undefined;
  if (!match || !d || d.toISOString().slice(0, 10) !== date) throw new Error(`Not a calendar date (expected YYYY-MM-DD): ${JSON.stringify(date)}`);
}

/**
 * The twelve months of `year`, each with the sum of regular gifts made for that month (the date given does not matter).
 * A month is marked `noGift` when it has begun (up to the month of `today`), has no regular gift, and is not before the
 * first month that ever received one, so history from before the owner started using the app is not flagged.
 */
export function monthlyRegularGiving(gifts: readonly RegularGift[], options: { year: number; today: string }): MonthGiving[] {
  checkDate(options.today);
  const totals = new Map<string, { cents: number; count: number }>();
  let firstMonth: string | undefined;
  for (const { forMonth, dateGiven, cents } of gifts) {
    checkMonth(forMonth);
    checkDate(dateGiven);
    checkCents(cents);
    const entry = totals.get(forMonth) ?? { cents: 0, count: 0 };
    entry.cents += cents;
    entry.count += 1;
    totals.set(forMonth, entry);
    if (firstMonth === undefined || forMonth < firstMonth) firstMonth = forMonth;
  }
  const thisMonth = options.today.slice(0, 7);
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${options.year}-${String(i + 1).padStart(2, "0")}`;
    const entry = totals.get(month) ?? { cents: 0, count: 0 };
    const noGift = entry.count === 0 && firstMonth !== undefined && month > firstMonth && month <= thisMonth;
    return { month, cents: entry.cents, count: entry.count, noGift };
  });
}

/** Regular giving counts by the month it is for; special contributions count by the date given. */
export function givingYearToDate(regular: readonly RegularGift[], special: readonly SpecialContribution[], options: { year: number }): YearGiving {
  const prefix = `${options.year}-`;
  let regularCents = 0;
  for (const { forMonth, cents } of regular) {
    checkMonth(forMonth);
    checkCents(cents);
    if (forMonth.startsWith(prefix)) regularCents += cents;
  }
  let specialCents = 0;
  for (const { dateGiven, cents } of special) {
    checkDate(dateGiven);
    checkCents(cents);
    if (dateGiven.startsWith(prefix)) specialCents += cents;
  }
  return { regularCents, specialCents, combinedCents: regularCents + specialCents };
}

/** The individual regular gifts made for one month, oldest first, so the owner can drill in from the month's total. */
export function giftsForMonth(gifts: readonly RegularGift[], month: string): RegularGift[] {
  checkMonth(month);
  return gifts
    .filter((gift) => {
      checkMonth(gift.forMonth);
      checkDate(gift.dateGiven);
      checkCents(gift.cents);
      return gift.forMonth === month;
    })
    .sort((a, b) => (a.dateGiven < b.dateGiven ? -1 : a.dateGiven > b.dateGiven ? 1 : a.cents - b.cents));
}

export interface MonthChartRow {
  month: string;
  regularCents: number;
  /** Special contributions count by the date given, as in `givingYearToDate`. */
  specialCents: number;
  /** Regular plus special giving in this month. */
  totalCents: number;
  /** Running total for the year, up to and including this month. */
  runningCents: number;
}

export interface GivingChart {
  rows: MonthChartRow[];
  yearCents: number;
  /** Months counted for the average: 12 for a past year, up to and including the current month for this year. */
  monthsSoFar: number;
  /** The year's total divided by `monthsSoFar`, rounded to a whole cent. */
  averageCents: number;
  /** True when the year has no gifts of either kind. */
  empty: boolean;
}

/**
 * Per-month giving for the chart (GIV-04). Regular gifts count in the month they are *for*; special contributions in the
 * month they were given. The running total stops at the current month of the current year, so it does not run flat into
 * the months that have not happened. Years after `today`'s year show every month.
 */
export function givingChart(regular: readonly RegularGift[], special: readonly SpecialContribution[], options: { year: number; today: string }): GivingChart {
  checkDate(options.today);
  const prefix = `${options.year}-`;
  const regularBy = new Map<string, number>();
  const specialBy = new Map<string, number>();
  for (const { forMonth, dateGiven, cents } of regular) {
    checkMonth(forMonth);
    checkDate(dateGiven);
    checkCents(cents);
    if (forMonth.startsWith(prefix)) regularBy.set(forMonth, (regularBy.get(forMonth) ?? 0) + cents);
  }
  for (const { dateGiven, cents } of special) {
    checkDate(dateGiven);
    checkCents(cents);
    if (dateGiven.startsWith(prefix)) specialBy.set(dateGiven.slice(0, 7), (specialBy.get(dateGiven.slice(0, 7)) ?? 0) + cents);
  }
  const thisYear = Number(options.today.slice(0, 4));
  const monthsSoFar = options.year < thisYear ? 12 : options.year === thisYear ? Number(options.today.slice(5, 7)) : 12;
  let running = 0;
  const rows: MonthChartRow[] = Array.from({ length: 12 }, (_, i) => {
    const month = `${options.year}-${String(i + 1).padStart(2, "0")}`;
    const regularCents = regularBy.get(month) ?? 0;
    const specialCents = specialBy.get(month) ?? 0;
    running += regularCents + specialCents;
    return { month, regularCents, specialCents, totalCents: regularCents + specialCents, runningCents: running };
  });
  const yearCents = running;
  return { rows, yearCents, monthsSoFar, averageCents: Math.round(yearCents / monthsSoFar), empty: regularBy.size === 0 && specialBy.size === 0 };
}
