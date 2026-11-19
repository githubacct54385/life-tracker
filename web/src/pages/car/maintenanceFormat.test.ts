import { describe, expect, it } from "vitest";
import { MAINTENANCE_TYPES } from "@life-tracker/shared";
import { addableService, formFromRecord, NEW_PLACE, parseCost, parseOdometer, toRequest, type ServiceForm } from "./maintenanceFormat";

const form = (over: Partial<ServiceForm> = {}): ServiceForm => ({ ticked: ["Oil change"], custom: [], doneBy: "shop", placeChoice: "", newPlace: "", cost: "", date: "2026-11-10", odometer: "", note: "", ...over });
const request = (over: Partial<ServiceForm> = {}) => toRequest(form(over), MAINTENANCE_TYPES, "2026-11-13");

describe("parseCost", () => {
  it("[AC-MIL-05.4] reads dollars into whole cents, allows blank and zero", () => {
    expect(parseCost("89.99")).toEqual({ valid: true, cents: 8999 });
    expect(parseCost("$1,250")).toEqual({ valid: true, cents: 125_000 });
    expect(parseCost("0")).toEqual({ valid: true, cents: 0 });
    expect(parseCost("12.5")).toEqual({ valid: true, cents: 1250 });
    expect(parseCost("")).toEqual({ valid: true });
    expect(parseCost("  ")).toEqual({ valid: true });
  });

  it("[AC-MIL-05.4] refuses text, negatives and more than two decimals", () => {
    for (const bad of ["abc", "-5", "1.234", "12.", "1,2,3x", "99999999"]) expect(parseCost(bad).valid, bad).toBe(false);
  });

  it("[AC-MIL-05.4] every whole number of cents survives a round trip through the text the screen shows", () => {
    // 0 to 100,000 cents one by one, then steps up to the largest allowed cost.
    const samples = [...Array.from({ length: 100_001 }, (_, i) => i), ...Array.from({ length: 1000 }, (_, i) => 100_000 + i * 99_901), 100_000_000];
    for (const cents of samples) {
      const parsed = parseCost((cents / 100).toFixed(2));
      if (!parsed.valid || parsed.cents !== cents) throw new Error(`Round trip failed for ${cents}`);
    }
    expect(samples.length).toBeGreaterThan(100_000);
  });
});

describe("parseOdometer", () => {
  it("[AC-MIL-05.6] reads whole miles, allows blank, refuses the rest", () => {
    expect(parseOdometer("48,300")).toEqual({ valid: true, miles: 48_300 });
    expect(parseOdometer("")).toEqual({ valid: true });
    for (const bad of ["abc", "-1", "1.5", "10000000"]) expect(parseOdometer(bad).valid, bad).toBe(false);
  });
});

describe("toRequest", () => {
  it("[AC-MIL-05.1] needs at least one service, from the ticks or the owner's own, at most eight", () => {
    expect(request({ ticked: [] }).problem).toMatch(/at least one/i);
    expect(request({ ticked: [], custom: ["Cabin filter"] }).request?.services).toEqual(["Cabin filter"]);
    expect(request({ ticked: ["Brakes", "Oil change"], custom: ["Cabin filter"] }).request?.services).toEqual(["Oil change", "Brakes", "Cabin filter"]);
    expect(request({ ticked: [...MAINTENANCE_TYPES], custom: ["Extra", "More"] }).problem).toMatch(/at most 8/i);
  });

  it("[AC-MIL-05.2][AC-MIL-05.3] a shop sends its place by name, a service at home sends none", () => {
    expect(request({ placeChoice: "Joe's Garage" }).request).toMatchObject({ doneBy: "shop", placeName: "Joe's Garage" });
    expect(request({ placeChoice: NEW_PLACE, newPlace: "  Acme Tire " }).request).toMatchObject({ placeName: "Acme Tire" });
    expect(request({ placeChoice: NEW_PLACE, newPlace: "  " }).problem).toMatch(/name of the place/i);
    expect(request({ placeChoice: "" }).request).not.toHaveProperty("placeName");
    const home = request({ doneBy: "home", placeChoice: "Joe's Garage", newPlace: "x" }).request!;
    expect(home.doneBy).toBe("home");
    expect(home).not.toHaveProperty("placeName");
  });

  it("[AC-MIL-05.4][AC-MIL-05.6][AC-MIL-05.7] sends cost, odometer and note only when given, and a cost of zero is sent", () => {
    expect(request().request).toEqual({ date: "2026-11-10", services: ["Oil change"], doneBy: "shop" });
    expect(request({ cost: "0", odometer: "48,300", note: " synthetic " }).request).toEqual({ date: "2026-11-10", services: ["Oil change"], doneBy: "shop", costCents: 0, odometerMiles: 48_300, note: "synthetic" });
    expect(request({ cost: "abc" }).problem).toMatch(/cost/i);
    expect(request({ odometer: "x" }).problem).toMatch(/odometer/i);
    expect(request({ note: "x".repeat(501) }).problem).toMatch(/note/i);
  });

  it("[AC-MIL-05.5] needs a date that is not after today", () => {
    expect(request({ date: "2026-11-13" }).request).toBeDefined();
    expect(request({ date: "2026-11-14" }).problem).toMatch(/future/i);
    expect(request({ date: "" }).problem).toMatch(/date/i);
  });
});

describe("custom services and editing", () => {
  it("[AC-MIL-05.1] a custom service is trimmed, 1 to 40 characters, and not one already listed (ignoring letter case)", () => {
    expect(addableService("  Cabin filter ", ["Tires"])).toBe("Cabin filter");
    expect(addableService("", [])).toBeUndefined();
    expect(addableService("x".repeat(41), [])).toBeUndefined();
    expect(addableService("tires", ["Tires"])).toBeUndefined();
  });

  it("[AC-MIL-05.8] a saved service becomes form values again, fixed types ticked and the rest custom", () => {
    const back = formFromRecord({ id: 1, date: "2026-11-10", services: ["Tires", "Cabin filter"], doneBy: "shop", place: { id: 1, name: "Joe's Garage" }, costCents: 8999, odometerMiles: 48_300, note: null }, MAINTENANCE_TYPES);
    expect(back).toMatchObject({ ticked: ["Tires"], custom: ["Cabin filter"], placeChoice: "Joe's Garage", cost: "89.99", odometer: "48300", note: "" });
  });
});
