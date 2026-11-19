// Groups the maintenance history for the three views (MIL-06): by month, by place and by kind of service. Pure: no clock, no I/O.
import type { MaintenanceRecord } from "./maintenance.js";
import { totalCostCents } from "./maintenanceHistory.js";

export interface HistoryGroup {
  /** Stable for the group, so an open or closed group stays that way when the list reloads. */
  key: string;
  title: string;
  /** Newest first: by date, then by id for two services on the same day. */
  records: MaintenanceRecord[];
  /** Cost of the services that have one. */
  totalCents: number;
  /** Date of the newest service in the group. */
  lastDate: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const key = (name: string) => name.trim().toLowerCase();
const newestFirst = (a: MaintenanceRecord, b: MaintenanceRecord) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1);

function build(buckets: Map<string, { title: string; records: MaintenanceRecord[] }>): HistoryGroup[] {
  return [...buckets.entries()]
    .map(([k, { title, records }]) => {
      const sorted = [...records].sort(newestFirst);
      return { key: k, title, records: sorted, totalCents: totalCostCents(sorted), lastDate: sorted[0]!.date };
    })
    .sort((a, b) => (a.lastDate === b.lastDate ? a.title.localeCompare(b.title) : a.lastDate < b.lastDate ? 1 : -1));
}

function bucket(records: readonly MaintenanceRecord[], keysOf: (r: MaintenanceRecord) => Array<{ key: string; title: string }>): HistoryGroup[] {
  const buckets = new Map<string, { title: string; records: MaintenanceRecord[] }>();
  for (const record of records) {
    for (const { key: k, title } of keysOf(record)) {
      const found = buckets.get(k);
      if (found) found.records.push(record);
      else buckets.set(k, { title, records: [record] });
    }
  }
  return build(buckets);
}

/** "2026-11" -> "November 2026". */
export function monthTitle(date: string): string {
  const [year, month] = date.split("-").map(Number);
  return `${MONTHS[(month ?? 1) - 1]} ${year}`;
}

/** One group per month, newest month first. */
export const groupByMonth = (records: readonly MaintenanceRecord[]): HistoryGroup[] => bucket(records, (r) => [{ key: r.date.slice(0, 7), title: monthTitle(r.date) }]);

/** One group per shop, plus "Done at home" and "No place named". The one visited last comes first. */
export const groupByPlace = (records: readonly MaintenanceRecord[]): HistoryGroup[] =>
  bucket(records, (r) => [r.doneBy === "home" ? { key: "home", title: "Done at home" } : r.place ? { key: `place-${r.place.id}`, title: r.place.name } : { key: "none", title: "No place named" }]);

/** One group per kind of service. A visit that did two things appears in both. The one done last comes first. */
export const groupByService = (records: readonly MaintenanceRecord[]): HistoryGroup[] => bucket(records, (r) => r.services.map((name) => ({ key: key(name), title: name.trim() })));
