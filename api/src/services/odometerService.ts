// Business rules for odometer readings (MIL-01, ADR-0008). The sanity checks themselves are in shared/readingChecks.ts
// (limit 300 miles a day), so the same code could warn the screen and guard the API. Nothing here touches SQL.
import { checkReading, type ReadingWarning } from "@life-tracker/shared";
import { odometerRepository, type OdometerRepository, type StoredReading } from "../repositories/odometerRepository.js";

/**
 * The owner's time zone decides which calendar day "now" is (ADR-0007). The time zone setting arrives with SET-02;
 * until then this default applies.
 */
export const DEFAULT_OWNER_TIME_ZONE = "America/Los_Angeles";

/** The calendar date ("YYYY-MM-DD") of an instant in a time zone. */
export function calendarDateIn(timeZone: string, instant: Date): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

export type SaveOutcome =
  | { status: "saved"; reading: StoredReading }
  | { status: "needs_confirmation"; warnings: ReadingWarning[] }
  | { status: "not_found" };

export interface OdometerService {
  list(limit?: number): Promise<StoredReading[]>;
  /** A new reading, dated now. Warnings must be confirmed first. */
  log(miles: number, confirmed: boolean): Promise<SaveOutcome>;
  /** Changes the value of a reading and keeps its original date. Warnings must be confirmed first. */
  edit(id: number, miles: number, confirmed: boolean): Promise<SaveOutcome>;
  /** Removes a reading for good. False when it does not exist. */
  remove(id: number): Promise<boolean>;
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

    async log(miles, confirmed) {
      const date = calendarDateIn(timeZone, now());
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
  };
}

export const odometerService = createOdometerService(odometerRepository);
