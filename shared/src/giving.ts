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
