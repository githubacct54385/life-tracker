import {
  checkReading,
  giftListResponseSchema,
  giftSchema,
  groupGiftsByMonth,
  healthResponseSchema,
  importMileageResultSchema,
  readingListResponseSchema,
  saveReadingResultSchema,
  saveWeightResultSchema,
  sortSpecialContributions,
  specialContributionListResponseSchema,
  specialContributionSchema,
  type SpecialContributionRecord,
  type GiftRecord,
  weightEntrySchema,
  weightListResponseSchema,
  type WeightEntryRecord,
  workoutListResponseSchema,
  workoutRecordSchema,
  maintenanceListResponseSchema,
  maintenanceRecordSchema,
  placeListResponseSchema,
  renamePlaceRequestSchema,
  saveMaintenanceRequestSchema,
  type MaintenanceRecord,
  type ServicePlace,
  type OdometerReadingRecord,
  type WorkoutRecord,
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
    { id: 4, dateGiven: "2026-11-02", forMonth: "2026-11", cents: 15_000, method: "card", description: "November tithe" },
    { id: 3, dateGiven: "2026-10-05", forMonth: "2026-10", cents: 15_000, method: "check", description: "October tithe" },
    { id: 2, dateGiven: "2026-10-28", forMonth: "2026-10", cents: 5_000, method: "card", description: null },
    { id: 1, dateGiven: "2026-10-03", forMonth: "2026-09", cents: 15_000, method: "check", description: "September tithe" },
  ];
}

/** Synthetic special contributions: two invented occasions, so the demo screen is not empty. */
function seedSpecial(): SpecialContributionRecord[] {
  return [
    { id: 2, dateGiven: "2026-09-14", occasion: "Building fund appeal", cents: 25_000, method: "check" },
    { id: 1, dateGiven: "2026-03-29", occasion: "Spring offering", cents: 10_000, method: "card" },
  ];
}

/** Synthetic weights, one a day for two weeks ending 2026-11-17, so the demo chart has a trend to show. Pounds. */
function seedWeights(): WeightEntryRecord[] {
  const pounds = [176.2, 175.8, 176.0, 175.1, 175.4, 174.9, 175.2, 174.6, 174.8, 174.1, 174.5, 173.9, 174.2, 173.6];
  return pounds.map((p, index) => ({ id: index + 1, date: `2026-11-${String(index + 4).padStart(2, "0")}`, pounds: p }));
}

/** Synthetic workouts, one from the watch and two by hand, so the demo screen shows both sources. */
function seedWorkouts(): WorkoutRecord[] {
  return [
    { id: 3, date: "2026-11-06", type: "Yoga", minutes: 40, reps: null, note: "Evening class", source: "manual" },
    { id: 2, date: "2026-11-05", type: "Run", minutes: 32, reps: null, note: null, source: "apple_watch" },
    { id: 1, date: "2026-11-03", type: "Strength", minutes: 45, reps: null, note: null, source: "manual" },
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
  let special = seedSpecial();
  let nextSpecialId = 3;
  let weights = seedWeights();
  let nextWeightId = 15;
  const newestWeights = () => [...weights].sort((a, b) => (a.date < b.date ? 1 : -1));
  let workouts = seedWorkouts();
  let nextWorkoutId = 4;
  let places: ServicePlace[] = [{ id: 1, name: "Joe's Garage" }];
  let nextPlaceId = 2;
  let services: MaintenanceRecord[] = [
    { id: 2, date: "2026-11-03", services: ["Oil change", "Air filter"], doneBy: "shop", place: { id: 1, name: "Joe's Garage" }, costCents: 8999, odometerMiles: 48_150, note: null },
    { id: 1, date: "2026-10-12", services: ["Wipers"], doneBy: "home", place: null, costCents: 1800, odometerMiles: 47_700, note: "Front pair" },
  ];
  let nextServiceId = 3;
  const placeFor = (name: string | undefined): ServicePlace | null => {
    const trimmed = name?.trim();
    if (!trimmed) return null;
    const found = places.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (found) return found;
    const place = { id: nextPlaceId++, name: trimmed };
    places = [...places, place];
    return place;
  };
  const newestServices = () => [...services].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
  const checkNotFuture = (date: string) => {
    if (date > localDate(now())) throw new Error("A service cannot be dated in the future");
  };
  const newestWorkouts = () => [...workouts].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
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
      const saved = giftSchema.parse({ id: nextGiftId++, ...gift, description: gift.description?.trim() || null });
      gifts = [...gifts, saved];
      return saved;
    },

    async editGift(id, gift) {
      if (!gifts.some((g) => g.id === id)) throw new Error("Gift not found");
      const saved = giftSchema.parse({ id, ...gift, description: gift.description?.trim() || null });
      gifts = gifts.map((g) => (g.id === id ? saved : g));
      return saved;
    },

    async deleteGift(id) {
      gifts = gifts.filter((g) => g.id !== id);
    },

    async listSpecialContributions() {
      return specialContributionListResponseSchema.parse({ contributions: sortSpecialContributions(special) });
    },

    async logSpecialContribution(contribution) {
      const saved = specialContributionSchema.parse({ id: nextSpecialId++, ...contribution });
      special = [...special, saved];
      return saved;
    },

    async editSpecialContribution(id, contribution) {
      if (!special.some((c) => c.id === id)) throw new Error("Special contribution not found");
      const saved = specialContributionSchema.parse({ id, ...contribution });
      special = special.map((c) => (c.id === id ? saved : c));
      return saved;
    },

    async deleteSpecialContribution(id) {
      special = special.filter((c) => c.id !== id);
    },

    async importReadings(rows) {
      const unique = [...new Map(rows.map((row) => [`${row.date}|${row.miles}`, row])).values()];
      const fresh = unique.filter((row) => !readings.some((r) => r.date === row.date && r.miles === row.miles));
      for (const row of fresh) readings = [...readings, { id: nextId++, ...row }];
      return importMileageResultSchema.parse({ imported: fresh.length, duplicates: rows.length - fresh.length });
    },

    async listWeights() {
      return weightListResponseSchema.parse({ entries: newestWeights() });
    },

    async logWeight(pounds, replace = false) {
      const date = localDate(now());
      const existing = weights.find((w) => w.date === date);
      if (existing && !replace) return saveWeightResultSchema.parse({ status: "needs_replace", existing });
      const entry = weightEntrySchema.parse({ id: existing?.id ?? nextWeightId++, date, pounds });
      weights = existing ? weights.map((w) => (w.id === existing.id ? entry : w)) : [...weights, entry];
      return saveWeightResultSchema.parse({ status: "saved", entry });
    },

    async editWeight(id, pounds) {
      const current = weights.find((w) => w.id === id);
      if (!current) throw new Error("Weight entry not found");
      const entry = weightEntrySchema.parse({ ...current, pounds });
      weights = weights.map((w) => (w.id === id ? entry : w));
      return entry;
    },

    async deleteWeight(id) {
      weights = weights.filter((w) => w.id !== id);
    },

    async listWorkouts() {
      return workoutListResponseSchema.parse({ workouts: newestWorkouts().slice(0, 100) });
    },

    async logWorkout({ type, minutes, reps, note }) {
      const workout = workoutRecordSchema.parse({ id: nextWorkoutId++, date: localDate(now()), type, minutes: minutes ?? null, reps: reps ?? null, note: note?.trim() || null, source: "manual" });
      workouts = [...workouts, workout];
      return workout;
    },

    async editWorkout(id, { type, minutes, reps, note }) {
      const current = workouts.find((w) => w.id === id);
      if (!current) throw new Error("Workout not found");
      const workout = workoutRecordSchema.parse({ ...current, type, minutes: minutes ?? null, reps: reps ?? null, note: note?.trim() || null });
      workouts = workouts.map((w) => (w.id === id ? workout : w));
      return workout;
    },

    async deleteWorkout(id) {
      workouts = workouts.filter((w) => w.id !== id);
    },

    async listMaintenance() {
      return maintenanceListResponseSchema.parse({ records: newestServices() });
    },

    async listServicePlaces() {
      return placeListResponseSchema.parse({ places: [...places].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())) });
    },

    async logMaintenance(request) {
      const input = saveMaintenanceRequestSchema.parse(request);
      checkNotFuture(input.date);
      const record = maintenanceRecordSchema.parse({
        id: nextServiceId++,
        date: input.date,
        services: input.services,
        doneBy: input.doneBy,
        place: input.doneBy === "shop" ? placeFor(input.placeName) : null,
        costCents: input.costCents ?? null,
        odometerMiles: input.odometerMiles ?? null,
        note: input.note?.trim() || null,
      });
      services = [...services, record];
      return record;
    },

    async editMaintenance(id, request) {
      const input = saveMaintenanceRequestSchema.parse(request);
      if (!services.some((s) => s.id === id)) throw new Error("Service not found");
      checkNotFuture(input.date);
      const record = maintenanceRecordSchema.parse({
        id,
        date: input.date,
        services: input.services,
        doneBy: input.doneBy,
        place: input.doneBy === "shop" ? placeFor(input.placeName) : null,
        costCents: input.costCents ?? null,
        odometerMiles: input.odometerMiles ?? null,
        note: input.note?.trim() || null,
      });
      services = services.map((s) => (s.id === id ? record : s));
      return record;
    },

    async deleteMaintenance(id) {
      services = services.filter((s) => s.id !== id);
    },

    async renameServicePlace(id, name) {
      const trimmed = renamePlaceRequestSchema.parse({ name }).name;
      const place = places.find((p) => p.id === id);
      if (!place) throw new Error("Place not found");
      if (places.some((p) => p.id !== id && p.name.toLowerCase() === trimmed.toLowerCase())) return { status: "name_taken" };
      const renamed = { id, name: trimmed };
      places = places.map((p) => (p.id === id ? renamed : p));
      services = services.map((s) => (s.place?.id === id ? { ...s, place: renamed } : s));
      return { status: "saved", place: renamed };
    },

    async deleteServicePlace(id) {
      if (!places.some((p) => p.id === id)) throw new Error("Place not found");
      if (services.some((s) => s.place?.id === id)) return "in_use";
      places = places.filter((p) => p.id !== id);
      return "deleted";
    },
  };
}
