// Sanity checks for a new or edited odometer reading (MIL-01). Pure: it returns warnings, the screen asks for confirmation.
// A warning never blocks a reading. The owner can confirm it (a typo is more likely than a real rollback, but a real
// one, such as a replaced cluster, is possible).

export interface CheckedReading {
  /** Calendar date, "YYYY-MM-DD". */
  date: string;
  miles: number;
}

export type ReadingWarning =
  | { kind: "lower_than_previous"; previous: CheckedReading }
  | { kind: "higher_than_next"; next: CheckedReading }
  | { kind: "implausible_jump"; miles: number; days: number };

export interface ReadingCheck {
  warnings: ReadingWarning[];
  /** True when any warning is present: the screen must ask the owner to confirm before saving. */
  needsConfirmation: boolean;
}

/** A typical day is well under this, so more than 300 miles in a day is worth a second look. Callers can pass their own limit. */
export const DEFAULT_MAX_MILES_PER_DAY = 300;

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

/**
 * Compares `candidate` with the closest saved reading on or before its date and the closest one after it.
 * `replaces` is the date of the reading being edited, which is left out of the comparison.
 */
export function checkReading(
  existing: readonly CheckedReading[],
  candidate: CheckedReading,
  options: { maxMilesPerDay?: number; replaces?: string } = {},
): ReadingCheck {
  const maxMilesPerDay = options.maxMilesPerDay ?? DEFAULT_MAX_MILES_PER_DAY;
  if (!Number.isFinite(candidate.miles) || candidate.miles < 0) throw new Error(`Miles must be a number, zero or more: ${candidate.miles}`);
  const day = toDayNumber(candidate.date);
  const replaces = options.replaces === undefined ? undefined : toDayNumber(options.replaces);

  let previous: { day: number; reading: CheckedReading } | undefined;
  let next: { day: number; reading: CheckedReading } | undefined;
  for (const reading of existing) {
    const d = toDayNumber(reading.date);
    if (d === replaces) continue;
    if (d <= day) {
      // On the same day, the higher value is the one that counts (see weeklyMiles), so compare with that one.
      if (!previous || d > previous.day || (d === previous.day && reading.miles > previous.reading.miles)) previous = { day: d, reading };
    } else if (!next || d < next.day) {
      next = { day: d, reading };
    }
  }

  const warnings: ReadingWarning[] = [];
  if (previous) {
    if (candidate.miles < previous.reading.miles) {
      warnings.push({ kind: "lower_than_previous", previous: previous.reading });
    } else {
      const days = Math.max(1, day - previous.day);
      const miles = candidate.miles - previous.reading.miles;
      if (miles > days * maxMilesPerDay) warnings.push({ kind: "implausible_jump", miles, days });
    }
  }
  if (next && candidate.miles > next.reading.miles) warnings.push({ kind: "higher_than_next", next: next.reading });
  return { warnings, needsConfirmation: warnings.length > 0 };
}
