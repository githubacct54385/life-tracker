import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { saveMaintenanceRequestSchema } from "@life-tracker/shared";
import { addDays, buildStagingSeed } from "./stagingSeed.js";

const TODAY = "2026-11-20";
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

describe("staging sample data (OPS-08)", () => {
  it("[AC-OPS-08.2] is the same every time for the same day, and moves with the day", () => {
    expect(buildStagingSeed(TODAY)).toEqual(buildStagingSeed(TODAY));
    expect(buildStagingSeed("2026-11-21").odometer.at(-1)?.date).toBe("2026-11-21");
  });

  it("[AC-OPS-08.2] has something for every page of the app", () => {
    const seed = buildStagingSeed(TODAY);
    expect(seed.odometer).toHaveLength(40);
    expect(seed.weights.length).toBeGreaterThan(30);
    expect(seed.workouts).toHaveLength(36);
    expect(seed.gifts.length).toBeGreaterThanOrEqual(9);
    expect(seed.specials).toHaveLength(2);
    expect(seed.places).toHaveLength(2);
    expect(seed.maintenance).toHaveLength(6);
  });

  it("[AC-OPS-08.2] odometer readings go up as the date goes up, one a week, ending today", () => {
    const { odometer } = buildStagingSeed(TODAY);
    expect(odometer.at(-1)?.date).toBe(TODAY);
    for (let i = 1; i < odometer.length; i += 1) {
      expect(odometer[i]!.date).toBe(addDays(odometer[i - 1]!.date, 7));
      expect(odometer[i]!.miles).toBeGreaterThan(odometer[i - 1]!.miles);
    }
  });

  it("[AC-OPS-08.2] every maintenance record passes the same check the API applies, and matches the odometer on its date", () => {
    const seed = buildStagingSeed(TODAY);
    for (const record of seed.maintenance) {
      const request = {
        date: record.date,
        services: record.services,
        doneBy: record.doneBy,
        ...(record.place === null ? {} : { placeName: record.place }),
        ...(record.costCents === null ? {} : { costCents: record.costCents }),
        ...(record.odometerMiles === null ? {} : { odometerMiles: record.odometerMiles }),
        ...(record.note === null ? {} : { note: record.note }),
      };
      expect(saveMaintenanceRequestSchema.safeParse(request).success, record.date).toBe(true);
      expect(seed.odometer.find((reading) => reading.date === record.date)?.miles).toBe(record.odometerMiles);
      if (record.place !== null) expect(seed.places).toContain(record.place);
      if (record.doneBy === "home") expect(record.place).toBeNull();
    }
  });

  it("[AC-OPS-08.2] holds only made-up data: round sample names, no files, nothing resembling a person", () => {
    const seed = buildStagingSeed(TODAY);
    expect(seed.places.every((name) => /^(Sample|Demo) /.test(name))).toBe(true);
    expect(seed.specials.every((gift) => gift.occasion.startsWith("Sample "))).toBe(true);
    const notes = [...seed.workouts.map((w) => w.note), ...seed.maintenance.map((m) => m.note)].filter((note) => note !== null);
    expect(new Set(notes)).toEqual(new Set(["Sample note"]));
  });

  it("[AC-OPS-08.2] stays valid for any day, including month ends and a leap day", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date("2025-01-01T00:00:00Z"), max: new Date("2040-12-31T00:00:00Z"), noInvalidDate: true }), (day) => {
        const today = day.toISOString().slice(0, 10);
        const seed = buildStagingSeed(today);

        const everyDate = [
          ...seed.odometer.map((r) => r.date),
          ...seed.weights.map((r) => r.date),
          ...seed.workouts.map((r) => r.date),
          ...seed.gifts.flatMap((r) => [r.givenOn, r.forMonth]),
          ...seed.specials.map((r) => r.givenOn),
          ...seed.maintenance.map((r) => r.date),
        ];
        expect(everyDate.every(isDate)).toBe(true);
        // Nothing is dated in the future.
        expect([...seed.odometer, ...seed.weights, ...seed.workouts, ...seed.maintenance].every((r) => r.date <= today)).toBe(true);
        expect([...seed.gifts.map((g) => g.givenOn), ...seed.specials.map((s) => s.givenOn)].every((date) => date <= today)).toBe(true);

        // The table is unique on the weight date, and a gift's month is always a first of the month, one gift a month.
        expect(new Set(seed.weights.map((w) => w.date)).size).toBe(seed.weights.length);
        expect(seed.gifts.every((g) => g.forMonth.endsWith("-01"))).toBe(true);
        expect(new Set(seed.gifts.map((g) => g.forMonth)).size).toBe(seed.gifts.length);

        // A session needs minutes or reps, within the limits the table enforces.
        for (const w of seed.workouts) {
          expect(w.minutes !== null || w.reps !== null).toBe(true);
          if (w.minutes !== null) expect(w.minutes >= 1 && w.minutes <= 1440).toBe(true);
          if (w.reps !== null) expect(w.reps >= 1 && w.reps <= 10_000).toBe(true);
        }
        for (const w of seed.weights) expect(Number(w.pounds) >= 20 && Number(w.pounds) <= 1500).toBe(true);
        for (const g of seed.gifts) expect(Number(g.amount) > 0).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
