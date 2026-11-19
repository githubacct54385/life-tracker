import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAINTENANCE_TYPES, type MaintenanceRecord } from "./maintenance.js";
import { filterHistory, lastDoneByService, ownServices, totalCostCents } from "./maintenanceHistory.js";

const rec = (id: number, date: string, services: string[], extra: Partial<MaintenanceRecord> = {}): MaintenanceRecord => ({ id, date, services, doneBy: "home", place: null, costCents: null, odometerMiles: null, note: null, ...extra });
const shop = { id: 1, name: "Joe's Garage" };

describe("lastDoneByService", () => {
  it("[AC-MIL-06.2] lists every fixed type, with no date for one that was never done", () => {
    const rows = lastDoneByService([rec(1, "2026-11-03", ["Oil change"], { odometerMiles: 48_150 })], MAINTENANCE_TYPES);
    expect(rows.map((r) => r.service)).toEqual([...MAINTENANCE_TYPES]);
    expect(rows[0]).toMatchObject({ service: "Oil change", date: "2026-11-03", odometerMiles: 48_150 });
    expect(rows[1]).toEqual({ service: "Tires", date: null, odometerMiles: null, milesSince: null });
  });

  it("[AC-MIL-06.2] uses the most recent service of a type, and the higher id when two are on the same day", () => {
    const rows = lastDoneByService([rec(1, "2026-10-01", ["Tires"], { odometerMiles: 100 }), rec(3, "2026-11-01", ["Tires"], { odometerMiles: 300 }), rec(2, "2026-11-01", ["Tires"], { odometerMiles: 200 })], MAINTENANCE_TYPES);
    expect(rows.find((r) => r.service === "Tires")).toMatchObject({ date: "2026-11-01", odometerMiles: 300 });
  });

  it("[AC-MIL-06.2] adds the owner's own types after the fixed ones, matched ignoring letter case", () => {
    const rows = lastDoneByService([rec(1, "2026-09-01", ["cabin filter"]), rec(2, "2026-10-01", ["Cabin Filter"]), rec(3, "2026-10-02", ["oil CHANGE"])], MAINTENANCE_TYPES);
    expect(rows.slice(MAINTENANCE_TYPES.length)).toEqual([{ service: "Cabin Filter", date: "2026-10-01", odometerMiles: null, milesSince: null }]);
    expect(rows[0]).toMatchObject({ service: "Oil change", date: "2026-10-02" });
  });

  it("[AC-MIL-06.3] gives the miles since when the service and the latest reading both have a mileage", () => {
    const rows = lastDoneByService([rec(1, "2026-11-03", ["Oil change"], { odometerMiles: 48_150 }), rec(2, "2026-11-04", ["Tires"])], MAINTENANCE_TYPES, 48_402);
    expect(rows[0]!.milesSince).toBe(252);
    expect(rows[1]!.milesSince).toBeNull(); // the service has no mileage
    expect(lastDoneByService([rec(1, "2026-11-03", ["Oil change"], { odometerMiles: 48_150 })], MAINTENANCE_TYPES)[0]!.milesSince).toBeNull(); // no reading
  });

  it("[AC-MIL-06.3] gives no miles since when the service mileage is higher than the latest reading", () => {
    expect(lastDoneByService([rec(1, "2026-11-03", ["Oil change"], { odometerMiles: 50_000 })], MAINTENANCE_TYPES, 48_402)[0]!.milesSince).toBeNull();
  });

  it("[AC-MIL-06.2][AC-MIL-06.3] property: never negative, and a type is listed once however the records are ordered", () => {
    const record = fc.record({
      id: fc.integer({ min: 1, max: 1000 }),
      date: fc.integer({ min: 0, max: 400 }).map((d) => new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10)),
      services: fc.array(fc.constantFrom("Oil change", "tires", "Brakes", "Cabin filter", "cabin FILTER"), { minLength: 1, maxLength: 3 }),
      odometerMiles: fc.option(fc.integer({ min: 0, max: 200_000 }), { nil: null }),
    });
    fc.assert(
      fc.property(fc.uniqueArray(record, { selector: (r) => r.id, maxLength: 12 }), fc.option(fc.integer({ min: 0, max: 200_000 }), { nil: undefined }), (items, latest) => {
        const records = items.map((r) => rec(r.id, r.date, r.services, { odometerMiles: r.odometerMiles }));
        const rows = lastDoneByService(records, MAINTENANCE_TYPES, latest);
        const names = rows.map((r) => r.service.toLowerCase());
        expect(new Set(names).size).toBe(names.length);
        for (const r of rows) expect(r.milesSince === null || r.milesSince >= 0).toBe(true);
        expect(lastDoneByService([...records].reverse(), MAINTENANCE_TYPES, latest)).toEqual(rows);
      }),
    );
  });
});

describe("filterHistory and totalCostCents", () => {
  const records = [
    rec(3, "2026-11-03", ["Oil change", "Air filter"], { doneBy: "shop", place: shop, costCents: 8999 }),
    rec(2, "2026-10-12", ["Wipers"], { costCents: 1800 }),
    rec(1, "2026-09-01", ["oil change"], { doneBy: "shop", place: { id: 2, name: "Quick Lube" }, costCents: null }),
  ];

  it("[AC-MIL-06.4] limits the list to one type, ignoring letter case, or to one place, or both", () => {
    expect(filterHistory(records, { service: "Oil change" }).map((r) => r.id)).toEqual([3, 1]);
    expect(filterHistory(records, { placeId: 1 }).map((r) => r.id)).toEqual([3]);
    expect(filterHistory(records, { service: "Oil change", placeId: 2 }).map((r) => r.id)).toEqual([1]);
    expect(filterHistory(records, {})).toEqual(records);
  });

  it("[AC-MIL-06.4] totals the costs that are known, counting a missing cost as nothing", () => {
    expect(totalCostCents(records)).toBe(10_799);
    expect(totalCostCents(filterHistory(records, { service: "Wipers" }))).toBe(1800);
    expect(totalCostCents([])).toBe(0);
  });

  it("[AC-MIL-06.4] property: the filtered total never exceeds the whole total", () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 100_000 }), { maxLength: 10 }), (costs) => {
      const all = costs.map((c, i) => rec(i + 1, "2026-11-01", i % 2 ? ["Tires"] : ["Brakes"], { costCents: c }));
      expect(totalCostCents(filterHistory(all, { service: "Tires" }))).toBeLessThanOrEqual(totalCostCents(all));
    }));
  });

  it("[AC-MIL-06.4] offers the owner's own types, once each, for the filter", () => {
    expect(ownServices([rec(1, "2026-01-01", ["cabin filter", "Tires"]), rec(2, "2026-01-02", ["Cabin Filter", "Coolant"])], MAINTENANCE_TYPES)).toEqual(["cabin filter", "Coolant"]);
  });
});
