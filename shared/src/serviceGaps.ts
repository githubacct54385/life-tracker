import type { MaintenanceRecord } from "./maintenance.js";
import type { ServiceInterval } from "./serviceIntervals.js";

// How long the owner really goes between the same kind of service (MIL-11). Pure: no clock, no I/O.
// A service type is matched ignoring letter case. A visit is one record that lists the type.

export type GapUnit = "miles" | "days";

const MS_PER_DAY = 86_400_000;
const DAYS_PER_MONTH = 365.25 / 12;
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY);
const key = (name: string) => name.trim().toLowerCase();

export interface ServiceGap {
  /** Dates of the two visits, "YYYY-MM-DD". */
  from: string;
  to: string;
  /** Days between the visits. 0 for two visits on one day. */
  days: number;
  /** Odometer miles between them, or null when either visit has no odometer, or the later one is lower (a typing slip, never guessed). */
  miles: number | null;
}

export interface ServiceGaps {
  /** The type as the owner most recently typed it. */
  service: string;
  /** How many visits of this type are recorded. */
  visits: number;
  /** The gaps that can be shown in the chosen unit, oldest first. */
  gaps: ServiceGap[];
  /** Gaps left out of the miles view because a visit had no usable odometer. Always 0 in the days view. */
  leftOut: number;
  /** The mean of the shown gaps in the chosen unit, rounded to a whole number, or null when none is shown. */
  average: number | null;
}

/** Newer last: by date, then by id for two visits on the same day. */
const sortVisits = (records: readonly MaintenanceRecord[]) => [...records].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));

const visitsOf = (records: readonly MaintenanceRecord[], service: string) => sortVisits(records.filter((r) => r.services.some((s) => key(s) === key(service))));

/** The gaps between each visit of `service` and the one before it, in `unit`. */
export function serviceGaps(records: readonly MaintenanceRecord[], service: string, unit: GapUnit): ServiceGaps {
  const visits = visitsOf(records, service);
  const typed = [...visits].reverse().flatMap((r) => r.services).find((s) => key(s) === key(service)) ?? service.trim();
  const all: ServiceGap[] = [];
  for (let i = 1; i < visits.length; i++) {
    const before = visits[i - 1]!;
    const after = visits[i]!;
    const miles = before.odometerMiles !== null && after.odometerMiles !== null && after.odometerMiles >= before.odometerMiles ? after.odometerMiles - before.odometerMiles : null;
    all.push({ from: before.date, to: after.date, days: dayNumber(after.date) - dayNumber(before.date), miles });
  }
  const shown = unit === "miles" ? all.filter((g) => g.miles !== null) : all;
  const values = shown.map((g) => (unit === "miles" ? g.miles! : g.days));
  const average = values.length ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : null;
  return { service: typed, visits: visits.length, gaps: shown, leftOut: all.length - shown.length, average };
}

/**
 * Every type that appears in the records, for the picker: first the ones with at least two visits (a gap can be shown), the one done
 * most recently first, then the rest. One spelling each, the owner's latest.
 */
export function gapServices(records: readonly MaintenanceRecord[]): string[] {
  const latest = new Map<string, { name: string; date: string; id: number; visits: number }>();
  for (const record of sortVisits(records)) {
    for (const name of record.services) {
      const seen = latest.get(key(name));
      latest.set(key(name), { name, date: record.date, id: record.id, visits: (seen?.visits ?? 0) + 1 });
    }
  }
  const rows = [...latest.values()];
  const newest = (a: (typeof rows)[number], b: (typeof rows)[number]) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1);
  return [...rows.filter((r) => r.visits >= 2).sort(newest), ...rows.filter((r) => r.visits < 2).sort(newest)].map((r) => r.name);
}

/** The interval to draw as a line in `unit`, or null: no line is drawn without an interval for that unit. Months become days at 30.44 a month. */
export function intervalLine(intervals: readonly ServiceInterval[], service: string, unit: GapUnit): number | null {
  const found = intervals.find((i) => key(i.service) === key(service));
  if (!found) return null;
  if (unit === "miles") return found.miles;
  return found.months === null ? null : Math.round(found.months * DAYS_PER_MONTH);
}
