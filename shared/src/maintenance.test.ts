import { describe, expect, it } from "vitest";
import { MAINTENANCE_TYPES, maintenanceRecordSchema, saveMaintenanceRequestSchema } from "./maintenance";

const base = { date: "2026-11-10", services: ["Oil change"], doneBy: "shop" as const };
const ok = (v: unknown) => saveMaintenanceRequestSchema.safeParse(v).success;

describe("service types", () => {
  it("[AC-MIL-05.1] offers the fixed list, and accepts a type the owner typed", () => {
    expect([...MAINTENANCE_TYPES]).toEqual(["Oil change", "Tires", "Rotate tires", "Multi-point inspection", "Brakes", "Battery", "Air filter", "Wipers", "Alignment"]);
    expect(ok({ ...base, services: ["Oil change", "Cabin filter"] })).toBe(true);
  });

  it("[AC-MIL-05.1] needs at least one type, at most eight, each 1 to 40 characters, none twice", () => {
    expect(ok({ ...base, services: [] })).toBe(false);
    expect(ok({ ...base, services: ["   "] })).toBe(false);
    expect(ok({ ...base, services: ["x".repeat(41)] })).toBe(false);
    expect(ok({ ...base, services: ["x".repeat(40)] })).toBe(true);
    expect(ok({ ...base, services: Array.from({ length: 9 }, (_, i) => `Job ${i}`) })).toBe(false);
    expect(ok({ ...base, services: Array.from({ length: 8 }, (_, i) => `Job ${i}`) })).toBe(true);
    expect(ok({ ...base, services: ["Tires", "tires"] })).toBe(false);
  });
});

describe("shop or home", () => {
  it("[AC-MIL-05.2][AC-MIL-05.3] a shop may name its place, and a service done at home may not", () => {
    expect(ok({ ...base, placeName: "Joe's Garage" })).toBe(true);
    expect(ok({ ...base })).toBe(true); // a shop with no name given
    expect(ok({ ...base, doneBy: "home" })).toBe(true);
    expect(ok({ ...base, doneBy: "home", placeName: "Joe's Garage" })).toBe(false);
    expect(ok({ ...base, doneBy: "someone" })).toBe(false);
    expect(ok({ ...base, placeName: "  " })).toBe(false);
    expect(ok({ ...base, placeName: "x".repeat(81) })).toBe(false);
  });
});

describe("cost, odometer, date and note", () => {
  it("[AC-MIL-05.4] a cost is whole cents, optional, and may be zero", () => {
    expect(ok({ ...base, costCents: 0 })).toBe(true);
    expect(ok({ ...base, costCents: 8999 })).toBe(true);
    for (const bad of [-1, 1.5, 100_000_001, "50"]) expect(ok({ ...base, costCents: bad }), String(bad)).toBe(false);
  });

  it("[AC-MIL-05.5] needs a real calendar date", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "11/10/2026", "", "2026-1-5"]) expect(ok({ ...base, date: bad }), bad).toBe(false);
    expect(ok({ ...base, date: "2024-02-29" })).toBe(true);
  });

  it("[AC-MIL-05.6] an odometer reading is a whole number from 0 to 9,999,999, and optional", () => {
    expect(ok({ ...base, odometerMiles: 48_500 })).toBe(true);
    for (const bad of [-1, 10_000_000, 2.5]) expect(ok({ ...base, odometerMiles: bad }), String(bad)).toBe(false);
  });

  it("[AC-MIL-05.7] a note may be up to 500 characters", () => {
    expect(ok({ ...base, note: "x".repeat(500) })).toBe(true);
    expect(ok({ ...base, note: "x".repeat(501) })).toBe(false);
  });

  it("[AC-MIL-05.9] refuses fields it does not know", () => {
    expect(ok({ ...base, id: 5 })).toBe(false);
    expect(ok({ ...base, placeId: 3 })).toBe(false);
  });
});

describe("record", () => {
  it("[AC-MIL-05.9] carries the place as an id and a name, or none", () => {
    const record = { id: 1, date: "2026-11-10", services: ["Brakes"], doneBy: "shop", place: { id: 2, name: "Joe's Garage" }, costCents: 25_000, odometerMiles: 48_000, note: null };
    expect(maintenanceRecordSchema.safeParse(record).success).toBe(true);
    expect(maintenanceRecordSchema.safeParse({ ...record, place: null, doneBy: "home" }).success).toBe(true);
  });
});
