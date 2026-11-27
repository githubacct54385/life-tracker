import type { MaintenanceRecord } from "./maintenance.js";
import { totalCostCents } from "./maintenanceHistory.js";
import { weeklyMiles, type OdometerReading } from "./mileage.js";
import { addMonths } from "./serviceIntervals.js";

// What the car costs, grouped for the cost charts (MIL-10). Pure: no clock (callers pass `today`), no I/O. Money is whole cents.
// A service with no cost is left out of every total and counted instead. A service with several types has one cost, so it is
// never split between them: it gets its own "Several services" bar.

export type CostPeriod = { kind: "last12" } | { kind: "all" } | { kind: "year"; year: number };

export interface CostRange {
  /** First and last day included, "YYYY-MM-DD". */
  from: string;
  to: string;
}

export interface CostBar {
  /** Stable for the bar. */
  key: string;
  label: string;
  cents: number;
  /** How many services with a cost are in the bar. */
  count: number;
}

export const HOME_LABEL = "Done at home";
export const NO_PLACE_LABEL = "Shop, no place named";
export const SEVERAL_LABEL = "Several services";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const key = (name: string) => name.trim().toLowerCase();
const hasCost = (r: MaintenanceRecord): r is MaintenanceRecord & { costCents: number } => r.costCents !== null;

/** The days a period covers. "Last 12 months" is this month and the 11 before it, up to today. "All time" starts at the first service. */
export function periodRange(period: CostPeriod, records: readonly MaintenanceRecord[], today: string): CostRange {
  if (period.kind === "year") return { from: `${period.year}-01-01`, to: `${period.year}-12-31` };
  if (period.kind === "last12") return { from: addMonths(`${today.slice(0, 7)}-01`, -11), to: today };
  const first = records.reduce((min, r) => (r.date < min ? r.date : min), today);
  return { from: first, to: today };
}

/** The choices for the period drop-down: last 12 months, all time, then every year that has a service, newest first. */
export function periodChoices(records: readonly MaintenanceRecord[]): Array<{ value: string; label: string; period: CostPeriod }> {
  const years = [...new Set(records.map((r) => Number(r.date.slice(0, 4))))].sort((a, b) => b - a);
  return [
    { value: "last12", label: "Last 12 months", period: { kind: "last12" } },
    { value: "all", label: "All time", period: { kind: "all" } },
    ...years.map((year) => ({ value: String(year), label: String(year), period: { kind: "year", year } as CostPeriod })),
  ];
}

export const inRange = (records: readonly MaintenanceRecord[], range: CostRange): MaintenanceRecord[] => records.filter((r) => r.date >= range.from && r.date <= range.to);

/** How many services in `records` have no cost. They are in no total (AC-MIL-10.5). */
export const noCostCount = (records: readonly MaintenanceRecord[]): number => records.filter((r) => r.costCents === null).length;

function months(range: CostRange): string[] {
  const out: string[] = [];
  for (let m = range.from.slice(0, 7); m <= range.to.slice(0, 7); ) {
    out.push(m);
    m = addMonths(`${m}-01`, 1).slice(0, 7);
  }
  return out;
}

/** Spend in each month of the range, oldest first, every month included (a month with no spend is a bar of 0). */
export function costsPerMonth(records: readonly MaintenanceRecord[], range: CostRange): CostBar[] {
  const inside = inRange(records, range).filter(hasCost);
  return months(range).map((month) => {
    const list = inside.filter((r) => r.date.startsWith(month));
    return { key: month, label: monthLabel(month), cents: totalCostCents(list), count: list.length };
  });
}

/** Spend in each calendar year from the first service with a cost to the last, oldest first. Across all time, not one period. */
export function costsPerYear(records: readonly MaintenanceRecord[]): CostBar[] {
  const costed = records.filter(hasCost);
  if (costed.length === 0) return [];
  const years = costed.map((r) => Number(r.date.slice(0, 4)));
  const bars: CostBar[] = [];
  for (let year = Math.min(...years); year <= Math.max(...years); year++) {
    const list = costed.filter((r) => r.date.startsWith(String(year)));
    bars.push({ key: String(year), label: String(year), cents: totalCostCents(list), count: list.length });
  }
  return bars;
}

function group(records: readonly MaintenanceRecord[], bucketOf: (r: MaintenanceRecord) => { key: string; label: string }): CostBar[] {
  const bars = new Map<string, CostBar>();
  for (const record of records.filter(hasCost)) {
    const { key: k, label } = bucketOf(record);
    const bar = bars.get(k) ?? { key: k, label, cents: 0, count: 0 };
    bar.cents += record.costCents;
    bar.count += 1;
    bars.set(k, bar);
  }
  return [...bars.values()].sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label));
}

/** Spend by place. A service done at home is one bar; a shop with no place named is another. Biggest first. */
export const costsByPlace = (records: readonly MaintenanceRecord[]): CostBar[] =>
  group(records, (r) => (r.doneBy === "home" ? { key: "home", label: HOME_LABEL } : r.place ? { key: `place-${r.place.id}`, label: r.place.name } : { key: "no-place", label: NO_PLACE_LABEL }));

/** Spend by kind of service. A service with more than one type has one cost, so it is "Several services", never split. Biggest first. */
export const costsByService = (records: readonly MaintenanceRecord[]): CostBar[] =>
  group(records, (r) => (r.services.length > 1 ? { key: "several", label: SEVERAL_LABEL } : { key: key(r.services[0]!), label: r.services[0]!.trim() }));

export type CostPerMile = { status: "ok"; centsPerMile: number; cents: number; miles: number } | { status: "not-enough-data"; cents: number };

/**
 * The spend in the range divided by the miles driven in the same range. The miles come from the weekly mileage readings
 * (not from the odometer kept on a service), and need at least two readings inside the range (AC-MIL-10.4).
 */
export function costPerMile(records: readonly MaintenanceRecord[], readings: readonly OdometerReading[], range: CostRange): CostPerMile {
  const cents = totalCostCents(inRange(records, range));
  const inside = readings.filter((r) => r.date >= range.from && r.date <= range.to);
  if (inside.length < 2) return { status: "not-enough-data", cents };
  const miles = weeklyMiles(inside).reduce((sum, p) => sum + p.miles, 0);
  if (miles <= 0) return { status: "not-enough-data", cents };
  return { status: "ok", centsPerMile: Math.round(cents / miles), cents, miles };
}
