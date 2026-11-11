import {
  checkReading,
  healthResponseSchema,
  readingListResponseSchema,
  saveReadingResultSchema,
  type OdometerReadingRecord,
} from "@life-tracker/shared";
import type { Api } from "../api/types";

/** Local calendar date of an instant, "YYYY-MM-DD". */
function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Synthetic readings, one a week, so the demo screen is not empty. */
function seedReadings(): OdometerReadingRecord[] {
  return [
    { id: 4, date: "2026-11-06", miles: 48_402 },
    { id: 3, date: "2026-10-30", miles: 48_190 },
    { id: 2, date: "2026-10-23", miles: 47_978 },
    { id: 1, date: "2026-10-16", miles: 47_790 },
  ];
}

/**
 * Stand-in for `api/client.ts`: the same interface, answered from fake data held in the browser.
 * It must never call `fetch` or any other network function (hard rule 7, AC-DEM-01.2).
 * All data here is synthetic (AC-DEM-01.3).
 */
export function createDemoApi(options: { now?: () => Date } = {}): Api {
  const now = options.now ?? (() => new Date());
  let readings = seedReadings();
  let nextId = 5;
  const newestFirst = () => [...readings].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));

  return {
    async health() {
      return healthResponseSchema.parse({ status: "ok" });
    },

    async listReadings() {
      return readingListResponseSchema.parse({ readings: newestFirst().slice(0, 30) });
    },

    async logReading(miles, confirmed = false) {
      const date = localDate(now());
      const check = checkReading(readings, { date, miles });
      if (check.needsConfirmation && !confirmed) return saveReadingResultSchema.parse({ status: "needs_confirmation", warnings: check.warnings });
      const reading = { id: nextId++, date, miles };
      readings = [...readings, reading];
      return saveReadingResultSchema.parse({ status: "saved", reading });
    },

    async editReading(id, miles, confirmed = false) {
      const current = readings.find((r) => r.id === id);
      if (!current) throw new Error("Reading not found");
      const check = checkReading(
        readings.filter((r) => r.id !== id),
        { date: current.date, miles },
      );
      if (check.needsConfirmation && !confirmed) return saveReadingResultSchema.parse({ status: "needs_confirmation", warnings: check.warnings });
      const reading = { ...current, miles };
      readings = readings.map((r) => (r.id === id ? reading : r));
      return saveReadingResultSchema.parse({ status: "saved", reading });
    },

    async deleteReading(id) {
      readings = readings.filter((r) => r.id !== id);
    },
  };
}
