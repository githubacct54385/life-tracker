// Pure helpers for the maintenance history (MIL-06): what was last done, how far ago in miles, and the filtered list with its total.
// No clock, no I/O. A service type is matched ignoring letter case, so "oil change" and "Oil change" are one type.
import type { MaintenanceRecord } from "./maintenance.js";

export interface LastDone {
  /** The type as shown: the fixed spelling when it is a fixed type, otherwise as the owner most recently typed it. */
  service: string;
  /** Calendar date of the latest service of this type, or null when none is recorded. */
  date: string | null;
  /** Odometer reading kept with that service, or null. */
  odometerMiles: number | null;
  /** Miles driven since then: the latest odometer reading minus the one kept with the service. Null unless both are known. */
  milesSince: number | null;
}

const key = (name: string) => name.trim().toLowerCase();

/** Newer first: by date, then by id for two services on the same day. */
const isNewer = (a: MaintenanceRecord, b: MaintenanceRecord) => a.date > b.date || (a.date === b.date && a.id > b.id);

/**
 * One row per type: every fixed type (with nulls when never done), then the owner's own types that appear in the records.
 * Fixed types keep the order of `fixed`; the owner's own are listed by name.
 */
export function lastDoneByService(records: readonly MaintenanceRecord[], fixed: readonly string[], latestOdometerMiles?: number): LastDone[] {
  const latest = new Map<string, { record: MaintenanceRecord; name: string }>();
  for (const record of records) {
    for (const name of record.services) {
      const current = latest.get(key(name));
      if (!current || isNewer(record, current.record)) latest.set(key(name), { record, name });
    }
  }
  const row = (service: string, found: { record: MaintenanceRecord } | undefined): LastDone => {
    const miles = found?.record.odometerMiles ?? null;
    const since = miles !== null && latestOdometerMiles !== undefined && latestOdometerMiles >= miles ? latestOdometerMiles - miles : null;
    return { service, date: found?.record.date ?? null, odometerMiles: miles, milesSince: since };
  };
  const fixedKeys = new Set(fixed.map(key));
  const own = [...latest.entries()].filter(([k]) => !fixedKeys.has(k)).sort(([a], [b]) => a.localeCompare(b));
  return [...fixed.map((name) => row(name, latest.get(key(name)))), ...own.map(([, found]) => row(found.name, found))];
}

export interface HistoryFilter {
  /** Only services that include this type. */
  service?: string;
  /** Only services done at this place. */
  placeId?: number;
  /** Only services whose types, place name or note contain this text (ignoring letter case). Blank means no limit. */
  text?: string;
}

/** True when `text` appears in what was done, the place's name or the note. */
export function matchesText(record: MaintenanceRecord, text: string): boolean {
  const needle = key(text);
  if (needle === "") return true;
  return [...record.services, record.place?.name ?? "", record.doneBy === "home" ? "at home" : "", record.note ?? ""].some((part) => part.toLowerCase().includes(needle));
}

export function filterHistory(records: readonly MaintenanceRecord[], filter: HistoryFilter): MaintenanceRecord[] {
  return records.filter(
    (r) =>
      (filter.service === undefined || r.services.some((s) => key(s) === key(filter.service!))) &&
      (filter.placeId === undefined || r.place?.id === filter.placeId) &&
      (filter.text === undefined || matchesText(r, filter.text)),
  );
}

/** Sum of the costs that are known. Services with no cost add nothing. */
export const totalCostCents = (records: readonly MaintenanceRecord[]): number => records.reduce((sum, r) => sum + (r.costCents ?? 0), 0);

/** Every type that appears in the records and is not a fixed one, for the filter's drop-down. Sorted, one spelling each. */
export function ownServices(records: readonly MaintenanceRecord[], fixed: readonly string[]): string[] {
  const fixedKeys = new Set(fixed.map(key));
  const seen = new Map<string, string>();
  for (const r of records) for (const s of r.services) if (!fixedKeys.has(key(s)) && !seen.has(key(s))) seen.set(key(s), s);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

