import {
  checkReading,
  giftListResponseSchema,
  giftSchema,
  groupGiftsByMonth,
  healthResponseSchema,
  readingListResponseSchema,
  saveReadingResultSchema,
  type GiftRecord,
  type OdometerReadingRecord,
} from "@life-tracker/shared";
import type { Api } from "../api/types";

/** Local calendar date of an instant, "YYYY-MM-DD". */
function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Weekly miles for the older synthetic history, oldest first. Each is added to the reading before it. */
const OLDER_WEEKLY_MILES = [212, 187, 240, 155, 201, 268, 190, 176, 233, 149, 205, 221, 198, 172, 244, 183];
/** Index (from the oldest) of the Friday with no reading, so the demo charts show a 14-day period too. */
const MISSED_FRIDAY = 5;

/**
 * Synthetic readings, one a week, so the demo screens are not empty. The newest four are fixed (tests and the
 * walkthrough rely on them); older ones lead up to them, with one missed week.
 */
function seedReadings(): OdometerReadingRecord[] {
  const recent: OdometerReadingRecord[] = [
    { id: 4, date: "2026-11-06", miles: 48_402 },
    { id: 3, date: "2026-10-30", miles: 48_190 },
    { id: 2, date: "2026-10-23", miles: 47_978 },
    { id: 1, date: "2026-10-16", miles: 47_790 },
  ];
  // Walk backwards from the 2026-10-16 reading, one Friday at a time.
  const older: OdometerReadingRecord[] = [];
  let miles = 47_790;
  let day = Date.UTC(2026, 9, 16);
  OLDER_WEEKLY_MILES.slice()
    .reverse()
    .forEach((weekly, index) => {
      miles -= weekly;
      day -= 7 * 86_400_000;
      if (index === OLDER_WEEKLY_MILES.length - 1 - MISSED_FRIDAY) return; // no reading that week
      older.push({ id: 100 + index, date: new Date(day).toISOString().slice(0, 10), miles });
    });
  return [...recent, ...older];
}

/** Synthetic gifts: one for each of the last few months, one paid late, so the demo screen is not empty. */
function seedGifts(): GiftRecord[] {
  return [
    { id: 4, dateGiven: "2026-11-02", forMonth: "2026-11", cents: 15_000, method: "card" },
    { id: 3, dateGiven: "2026-10-05", forMonth: "2026-10", cents: 15_000, method: "check" },
    { id: 2, dateGiven: "2026-10-28", forMonth: "2026-10", cents: 5_000, method: "card" },
    { id: 1, dateGiven: "2026-10-03", forMonth: "2026-09", cents: 15_000, method: "check" },
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
  let nextId = 200;
  let gifts = seedGifts();
  let nextGiftId = 5;
  const newestFirst = () => [...readings].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));

  return {
    async health() {
      return healthResponseSchema.parse({ status: "ok" });
    },

    async listReadings() {
      return readingListResponseSchema.parse({ readings: newestFirst().slice(0, 30) });
    },

    async listAllReadings() {
      return readingListResponseSchema.parse({ readings: newestFirst() });
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

    async listGifts() {
      return giftListResponseSchema.parse({ gifts: groupGiftsByMonth(gifts).flatMap((m) => m.gifts) });
    },

    async logGift(gift) {
      const saved = giftSchema.parse({ id: nextGiftId++, ...gift });
      gifts = [...gifts, saved];
      return saved;
    },

    async editGift(id, gift) {
      if (!gifts.some((g) => g.id === id)) throw new Error("Gift not found");
      const saved = giftSchema.parse({ id, ...gift });
      gifts = gifts.map((g) => (g.id === id ? saved : g));
      return saved;
    },

    async deleteGift(id) {
      gifts = gifts.filter((g) => g.id !== id);
    },
  };
}
