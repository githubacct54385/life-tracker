// Business rules for odometer readings (MIL-01, ADR-0008). The sanity checks themselves are in shared/readingChecks.ts
// (limit 300 miles a day), so the same code could warn the screen and guard the API. Nothing here touches SQL.
import { calendarDateIn, checkReading, isValidTimeZone, type ImportMileageResult, type ImportRow, type ReadingWarning } from "@life-tracker/shared";
import { odometerRepository, type OdometerRepository, type StoredReading } from "../repositories/odometerRepository.js";

/**
 * The owner's time zone decides which calendar day "now" is (ADR-0007). The browser sends its Settings value with each
 * request (shared/timeZone.ts); this default applies when none arrives or it is not a real zone.
 */
export const DEFAULT_OWNER_TIME_ZONE = "America/Los_Angeles";

export { calendarDateIn };

export type SaveOutcome =
  | { status: "saved"; reading: StoredReading }
  | { status: "needs_confirmation"; warnings: ReadingWarning[] }
  | { status: "not_found" };

export interface OdometerService {
  list(limit?: number): Promise<StoredReading[]>;
  /** A new reading, dated now. Warnings must be confirmed first. */
  log(miles: number, confirmed: boolean, timeZone?: string): Promise<SaveOutcome>;
  /** Changes the value of a reading and keeps its original date. Warnings must be confirmed first. */
  edit(id: number, miles: number, confirmed: boolean): Promise<SaveOutcome>;
  /** Removes a reading for good. False when it does not exist. */
  remove(id: number): Promise<boolean>;
  /**
   * Adds readings from a spreadsheet import (MIL-04). A row whose date and miles already exist, or that repeats earlier
   * in the same list, is skipped, so importing the same file twice adds nothing (AC-MIL-04.4). Dates come from the file.
   */
  importReadings(rows: readonly ImportRow[]): Promise<ImportMileageResult>;
}

export interface OdometerServiceOptions {
  now?: () => Date;
  timeZone?: string;
}

export function createOdometerService(repo: OdometerRepository, options: OdometerServiceOptions = {}): OdometerService {
  const now = options.now ?? (() => new Date());
  const timeZone = options.timeZone ?? DEFAULT_OWNER_TIME_ZONE;

  return {
    async list(limit = 30) {
      return (await repo.listAll()).slice(0, limit);
    },

    async log(miles, confirmed, requestZone) {
      const date = calendarDateIn(isValidTimeZone(requestZone) ? requestZone : timeZone, now());
      const check = checkReading(await repo.listAll(), { date, miles });
      if (check.needsConfirmation && !confirmed) return { status: "needs_confirmation", warnings: check.warnings };
      return { status: "saved", reading: await repo.insert({ date, miles }) };
    },

    async edit(id, miles, confirmed) {
      const all = await repo.listAll();
      const current = all.find((reading) => reading.id === id);
      if (!current) return { status: "not_found" };
      // Compare against the other readings, at the reading's own date.
      const others = all.filter((reading) => reading.id !== id);
      const check = checkReading(others, { date: current.date, miles });
      if (check.needsConfirmation && !confirmed) return { status: "needs_confirmation", warnings: check.warnings };
      const updated = await repo.updateMiles(id, miles);
      return updated ? { status: "saved", reading: updated } : { status: "not_found" };
    },

    remove: (id) => repo.remove(id),

    async importReadings(rows) {
      const unique = [...new Map(rows.map((row) => [`${row.date}|${row.miles}`, row])).values()];
      const imported = await repo.insertMissing(unique);
      return { imported, duplicates: rows.length - imported };
    },
  };
}

export const odometerService = createOdometerService(odometerRepository);
