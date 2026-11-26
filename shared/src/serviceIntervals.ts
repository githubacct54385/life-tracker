import { z } from "zod";
import type { MaintenanceRecord } from "./maintenance.js";
import { MAX_SERVICE_NAME_LENGTH } from "./maintenance.js";
import { lastDoneByService } from "./maintenanceHistory.js";
import type { OdometerReading } from "./mileage.js";

// How often each kind of service is due, and when it is next due (MIL-09). Pure: no clock, no I/O.
// Dates are plain calendar dates ("YYYY-MM-DD", ADR-0007). A service type is matched ignoring letter case.

export const MAX_INTERVAL_MILES = 200_000;
export const MAX_INTERVAL_MONTHS = 120;
/** "Due soon" starts this close to the due mileage or the due date (AC-MIL-09.4). */
export const DUE_SOON_MILES = 500;
export const DUE_SOON_DAYS = 30;
/** The average miles per day is taken over this many days, and needs at least two readings inside them (AC-MIL-09.3). */
export const MILES_PER_DAY_WINDOW_DAYS = 90;

const serviceNameSchema = z.string().trim().min(1).max(MAX_SERVICE_NAME_LENGTH);
const milesSchema = z.number().int().min(1).max(MAX_INTERVAL_MILES);
const monthsSchema = z.number().int().min(1).max(MAX_INTERVAL_MONTHS);

export const serviceIntervalSchema = z.object({
  id: z.number().int().positive(),
  service: serviceNameSchema,
  miles: milesSchema.nullable(),
  months: monthsSchema.nullable(),
});
export type ServiceInterval = z.infer<typeof serviceIntervalSchema>;

/** Body of PUT /api/maintenance/intervals: sets the interval of one service type, replacing any it had. At least one of the two is needed. */
export const saveServiceIntervalRequestSchema = z
  .object({ service: serviceNameSchema, miles: milesSchema.optional(), months: monthsSchema.optional() })
  .strict()
  .refine((value) => value.miles !== undefined || value.months !== undefined, { message: "Give the miles, the months, or both", path: ["miles"] });
export type SaveServiceIntervalRequest = z.infer<typeof saveServiceIntervalRequestSchema>;

export const serviceIntervalListResponseSchema = z.object({ intervals: z.array(serviceIntervalSchema) });
export type ServiceIntervalListResponse = z.infer<typeof serviceIntervalListResponseSchema>;

const MS_PER_DAY = 86_400_000;
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY);
const fromDayNumber = (day: number) => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
const key = (name: string) => name.trim().toLowerCase();

/** The date `months` calendar months after `date`. The 31st of a month with no 31st becomes that month's last day. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = index % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

/**
 * Average miles driven per day over the last 90 days: the odometer change between the first and the last reading inside the
 * window, divided by the days between them. Undefined when fewer than two readings fall inside it, or they are on one day
 * (AC-MIL-09.3). Never negative.
 */
export function averageMilesPerDay(readings: readonly OdometerReading[], today: string): number | undefined {
  const end = dayNumber(today);
  const inside = readings.filter((r) => dayNumber(r.date) > end - MILES_PER_DAY_WINDOW_DAYS && dayNumber(r.date) <= end).sort((a, b) => a.date.localeCompare(b.date));
  const first = inside[0];
  const last = inside[inside.length - 1];
  if (!first || !last) return undefined;
  const days = dayNumber(last.date) - dayNumber(first.date);
  if (days <= 0) return undefined;
  return Math.max(0, last.miles - first.miles) / days;
}

export type DueState = "ok" | "due-soon" | "overdue" | "never-logged" | "needs-mileage";

export interface NextDue {
  service: string;
  intervalMiles: number | null;
  intervalMonths: number | null;
  state: DueState;
  /** Date of the last service of this type, or null when never logged. */
  lastDate: string | null;
  /** Odometer mileage at which it is due (last mileage plus the miles interval), or null. */
  dueMiles: number | null;
  /** Miles left until then, negative when passed. Null without a due mileage or a current reading. */
  milesLeft: number | null;
  /** Calendar date at which it is due (last date plus the months interval), or null. */
  dueDate: string | null;
  /** Days left until then, negative when passed. */
  daysLeft: number | null;
  /** The date the due mileage is expected to be reached at the recent pace. Null when there is too little mileage data, or the mileage has already passed. */
  estimatedDate: string | null;
  /** The sooner of daysLeft and the days until the due mileage at the recent pace. Used to sort by urgency. Null when neither is known. */
  daysUntilDue: number | null;
}

const RANK: Record<DueState, number> = { overdue: 0, "due-soon": 1, ok: 2, "needs-mileage": 3, "never-logged": 4 };

/**
 * One row per service type that has an interval, most urgent first. A type with no interval is never listed (AC-MIL-09.1).
 * Each type is due by whichever comes first, the mileage or the date (AC-MIL-09.2). `odometer` is the latest reading.
 */
export function nextDue(
  records: readonly MaintenanceRecord[],
  intervals: readonly ServiceInterval[],
  odometer: number | undefined,
  milesPerDay: number | undefined,
  today: string,
): NextDue[] {
  const last = new Map(lastDoneByService(records, [], odometer).map((row) => [key(row.service), row]));
  const rows = intervals.map((interval): NextDue => {
    const found = last.get(key(interval.service));
    const base: NextDue = { service: interval.service, intervalMiles: interval.miles, intervalMonths: interval.months, state: "never-logged", lastDate: found?.date ?? null, dueMiles: null, milesLeft: null, dueDate: null, daysLeft: null, estimatedDate: null, daysUntilDue: null };
    if (!found || found.date === null) return base;

    const dueMiles = interval.miles !== null && found.odometerMiles !== null ? found.odometerMiles + interval.miles : null;
    const milesLeft = dueMiles !== null && odometer !== undefined ? dueMiles - odometer : null;
    const dueDate = interval.months !== null ? addMonths(found.date, interval.months) : null;
    const daysLeft = dueDate !== null ? dayNumber(dueDate) - dayNumber(today) : null;
    const pace = milesPerDay !== undefined && milesPerDay > 0 ? milesPerDay : undefined;
    const milesDays = milesLeft !== null && pace !== undefined ? Math.ceil(milesLeft / pace) : null;
    const estimatedDate = milesLeft !== null && milesLeft > 0 && milesDays !== null ? fromDayNumber(dayNumber(today) + milesDays) : null;
    const knownDays = [daysLeft, milesLeft !== null && milesLeft <= 0 ? milesLeft : milesDays].filter((n): n is number => n !== null);
    const daysUntilDue = knownDays.length ? Math.min(...knownDays) : null;

    // A miles-only interval cannot work when the last service kept no mileage, or there is no current reading to compare with.
    const milesUnknown = interval.miles !== null && milesLeft === null;
    if (milesUnknown && daysLeft === null) return { ...base, dueMiles, milesLeft, dueDate, daysLeft, estimatedDate, daysUntilDue, state: "needs-mileage" };

    const overdue = (milesLeft !== null && milesLeft < 0) || (daysLeft !== null && daysLeft < 0);
    const soon = (milesLeft !== null && milesLeft <= DUE_SOON_MILES) || (daysLeft !== null && daysLeft <= DUE_SOON_DAYS);
    return { ...base, dueMiles, milesLeft, dueDate, daysLeft, estimatedDate, daysUntilDue, state: overdue ? "overdue" : soon ? "due-soon" : "ok" };
  });
  return rows.sort((a, b) => RANK[a.state] - RANK[b.state] || (a.daysUntilDue ?? Infinity) - (b.daysUntilDue ?? Infinity) || a.service.localeCompare(b.service));
}

/** The services shown on Home: only those overdue or due soon, most urgent first (AC-MIL-09.5). */
export const mostUrgent = (rows: readonly NextDue[], limit = 3): NextDue[] => rows.filter((r) => r.state === "overdue" || r.state === "due-soon").slice(0, limit);

/** The date to put in the calendar for a service: the date it is due, or else the estimated date for the due mileage. */
export function calendarDate(row: NextDue): string | null {
  const dates = [row.dueDate, row.estimatedDate].filter((d): d is string => d !== null);
  return dates.length ? dates.sort()[0]! : null;
}

const icsText = (text: string) => text.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/[\r\n]+/g, " ");

/**
 * A calendar file (.ics) with one all-day event that holds only the service name and the date, nothing else (AC-MIL-09.6).
 * No place, cost, note or mileage goes in. The id is made from the date and name so importing twice does not duplicate.
 */
export function dueCalendarFile(service: string, date: string): string {
  const compact = date.replaceAll("-", "");
  const next = fromDayNumber(dayNumber(date) + 1).replaceAll("-", "");
  const uid = `${compact}-${key(service).replace(/[^a-z0-9]+/g, "-")}@life-tracker`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Life Tracker//Service due//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${compact}T000000Z`,
    `DTSTART;VALUE=DATE:${compact}`,
    `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${icsText(`${service.trim()} due`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
