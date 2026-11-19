// Business rules for weight (HLT-01). An entry is dated when it is saved (AC-HLT-01.1), so the caller never supplies a date.
// Only one entry per day is kept: a second one for today is not saved until the owner confirms replacing the first (AC-HLT-01.3).
// Nothing here touches SQL.
import { weightRepository, type StoredWeight, type WeightRepository } from "../repositories/weightRepository.js";
import { isValidTimeZone } from "@life-tracker/shared";
import { calendarDateIn, DEFAULT_OWNER_TIME_ZONE } from "./odometerService.js";

export type WeightOutcome = { status: "saved"; entry: StoredWeight } | { status: "needs_replace"; existing: StoredWeight };

export interface WeightService {
  list(limit?: number): Promise<StoredWeight[]>;
  /** Saves today's weight. When today already has one, nothing is saved unless `replace` is true. */
  log(pounds: number, replace?: boolean, timeZone?: string): Promise<WeightOutcome>;
  /** Changes the value and keeps the date. Undefined when it does not exist. */
  edit(id: number, pounds: number): Promise<StoredWeight | undefined>;
  /** Removes an entry for good. False when it does not exist. */
  remove(id: number): Promise<boolean>;
}

export interface WeightServiceOptions {
  now?: () => Date;
  timeZone?: string;
}

/** Enough for several years of daily entries. */
const DEFAULT_LIMIT = 2000;

export function createWeightService(repo: WeightRepository, options: WeightServiceOptions = {}): WeightService {
  const now = options.now ?? (() => new Date());
  const timeZone = options.timeZone ?? DEFAULT_OWNER_TIME_ZONE;

  return {
    list: (limit = DEFAULT_LIMIT) => repo.list(limit),

    async log(pounds, replace = false, requestZone) {
      const date = calendarDateIn(isValidTimeZone(requestZone) ? requestZone : timeZone, now());
      const existing = await repo.findByDate(date);
      if (!existing) return { status: "saved", entry: await repo.insert({ date, pounds }) };
      if (!replace) return { status: "needs_replace", existing };
      const entry = await repo.update(existing.id, pounds);
      return entry ? { status: "saved", entry } : { status: "saved", entry: await repo.insert({ date, pounds }) };
    },

    edit: (id, pounds) => repo.update(id, pounds),

    remove: (id) => repo.remove(id),
  };
}

export const weightService = createWeightService(weightRepository);
