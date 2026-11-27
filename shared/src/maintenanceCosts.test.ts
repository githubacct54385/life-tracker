import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { MaintenanceRecord } from "./maintenance.js";
import { HOME_LABEL, NO_PLACE_LABEL, SEVERAL_LABEL, costPerMile, costsByPlace, costsByService, costsPerMonth, costsPerYear, noCostCount, periodChoices, periodRange } from "./maintenanceCosts.js";

const joes = { id: 1, name: "Joe's Garage" };
const acme = { id: 2, name: "Acme Tire" };
const rec = (id: number, date: string, services: string[], costCents: number | null, doneBy: "shop" | "home" = "shop", place: MaintenanceRecord["place"] = null): MaintenanceRecord => ({ id, date, services, doneBy, place, costCents, odometerMiles: null, note: null });
const TODAY = "2026-11-26";
const RECORDS = [
  rec(1, "2025-12-05", ["Oil change"], 8000, "shop", joes),
  rec(2, "2026-03-10", ["Tires"], 60_000, "shop", acme),
  rec(3, "2026-03-20", ["Wipers"], 1800, "home"),
  rec(4, "2026-09-02", ["Oil change", "Air filter"], 9500, "shop", joes),
  rec(5, "2026-10-15", ["Brakes"], null, "shop", joes),
  rec(6, "2026-11-01", ["Oil change"], 4500, "home"),
];

describe("periods", () => {
  it("[AC-MIL-10.4] last 12 months is this month and the 11 before it, up to today; a year is its whole calendar year; all time starts at the first service", () => {
    expect(periodRange({ kind: "last12" }, RECORDS, TODAY)).toEqual({ from: "2025-12-01", to: TODAY });
    expect(periodRange({ kind: "year", year: 2026 }, RECORDS, TODAY)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(periodRange({ kind: "all" }, RECORDS, TODAY)).toEqual({ from: "2025-12-05", to: TODAY });
    expect(periodRange({ kind: "all" }, [], TODAY)).toEqual({ from: TODAY, to: TODAY });
  });

  it("[AC-MIL-10.1] offers last 12 months, all time, then each year that has a service, newest first", () => {
    expect(periodChoices(RECORDS).map((c) => c.label)).toEqual(["Last 12 months", "All time", "2026", "2025"]);
    expect(periodChoices([]).map((c) => c.label)).toEqual(["Last 12 months", "All time"]);
  });
});

describe("costsPerMonth and costsPerYear", () => {
  it("[AC-MIL-10.1] adds up the spend in every month of the range, oldest first, with a bar of 0 for a month with no spend", () => {
    const bars = costsPerMonth(RECORDS, periodRange({ kind: "last12" }, RECORDS, TODAY));
    expect(bars).toHaveLength(12);
    expect(bars[0]).toEqual({ key: "2025-12", label: "Dec 2025", cents: 8000, count: 1 });
    expect(bars.find((b) => b.key === "2026-03")).toMatchObject({ cents: 61_800, count: 2 });
    expect(bars.find((b) => b.key === "2026-01")).toMatchObject({ cents: 0, count: 0 });
    expect(bars.at(-1)).toMatchObject({ key: "2026-11", cents: 4500 });
  });

  it("[AC-MIL-10.1] adds up the spend in each year from the first to the last service with a cost, including a year with none", () => {
    expect(costsPerYear(RECORDS)).toEqual([
      { key: "2025", label: "2025", cents: 8000, count: 1 },
      { key: "2026", label: "2026", cents: 75_800, count: 4 },
    ]);
    expect(costsPerYear([rec(1, "2023-05-01", ["X"], 100), rec(2, "2025-05-01", ["X"], 200)]).map((b) => [b.label, b.cents])).toEqual([["2023", 100], ["2024", 0], ["2025", 200]]);
    expect(costsPerYear([])).toEqual([]);
    expect(costsPerYear([rec(1, "2025-01-01", ["X"], null)])).toEqual([]);
  });

  it("[AC-MIL-10.5] a service with no cost is in no total and adds no count", () => {
    const bars = costsPerMonth(RECORDS, { from: "2026-10-01", to: "2026-10-31" });
    expect(bars).toEqual([{ key: "2026-10", label: "Oct 2026", cents: 0, count: 0 }]);
  });
});

describe("costsByPlace", () => {
  it("[AC-MIL-10.2] splits the spend by place, biggest first, with Done at home as its own bar", () => {
    expect(costsByPlace(RECORDS).map((b) => [b.label, b.cents, b.count])).toEqual([["Acme Tire", 60_000, 1], ["Joe's Garage", 17_500, 2], [HOME_LABEL, 6300, 2]]);
  });

  it("[AC-MIL-10.2] a shop service with no place named is its own bar, not lumped in with home", () => {
    expect(costsByPlace([rec(1, "2026-01-01", ["X"], 500, "shop", null), rec(2, "2026-01-02", ["X"], 200, "home")]).map((b) => b.label)).toEqual([NO_PLACE_LABEL, HOME_LABEL]);
  });

  it("[AC-MIL-10.2] two places with the same name are told apart by place, and a place with no cost shows no bar", () => {
    const a = { id: 7, name: "Same" };
    const b = { id: 8, name: "Same" };
    expect(costsByPlace([rec(1, "2026-01-01", ["X"], 100, "shop", a), rec(2, "2026-01-02", ["X"], 200, "shop", b), rec(3, "2026-01-03", ["X"], null, "shop", joes)])).toHaveLength(2);
  });
});

describe("costsByService", () => {
  it("[AC-MIL-10.3] splits the spend by kind of service, and a service with several types is one 'Several services' bar, never split", () => {
    expect(costsByService(RECORDS).map((b) => [b.label, b.cents, b.count])).toEqual([["Tires", 60_000, 1], [SEVERAL_LABEL, 9500, 1], ["Oil change", 12_500, 2], ["Wipers", 1800, 1]].sort((x, y) => (y[1] as number) - (x[1] as number)));
  });

  it("[AC-MIL-10.3] matches a type ignoring letter case and keeps one spelling", () => {
    const bars = costsByService([rec(1, "2026-01-01", ["oil change"], 100), rec(2, "2026-02-01", ["Oil Change"], 200)]);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ cents: 300, count: 2 });
  });

  it("[AC-MIL-10.3] the bars always add up to the total spend, whatever the data", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ cost: fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: null }), home: fc.boolean(), many: fc.boolean() }), { maxLength: 15 }), (rows) => {
        const records = rows.map((r, i) => rec(i + 1, "2026-05-01", r.many ? ["A", "B"] : ["A"], r.cost, r.home ? "home" : "shop", r.home ? null : joes));
        const total = records.reduce((s, r) => s + (r.costCents ?? 0), 0);
        return costsByPlace(records).reduce((s, b) => s + b.cents, 0) === total && costsByService(records).reduce((s, b) => s + b.cents, 0) === total;
      }),
    );
  });
});

describe("noCostCount", () => {
  it("[AC-MIL-10.5] counts the services with no cost, and treats a cost of $0 as a cost", () => {
    expect(noCostCount(RECORDS)).toBe(1);
    expect(noCostCount([rec(1, "2026-01-01", ["X"], 0), rec(2, "2026-01-01", ["X"], null), rec(3, "2026-01-01", ["X"], null)])).toBe(2);
    expect(noCostCount([])).toBe(0);
  });
});

describe("costPerMile", () => {
  const range = { from: "2026-01-01", to: "2026-12-31" };
  const readings = [{ date: "2026-01-02", miles: 40_000 }, { date: "2026-01-09", miles: 40_200 }, { date: "2026-01-16", miles: 40_500 }];

  it("[AC-MIL-10.4] divides the spend in the range by the miles driven in the range, from the weekly readings", () => {
    const result = costPerMile([rec(1, "2026-01-05", ["X"], 7000), rec(2, "2025-06-01", ["X"], 999_999)], readings, range);
    expect(result).toEqual({ status: "ok", centsPerMile: 14, cents: 7000, miles: 500 });
  });

  it("[AC-MIL-10.4] says not enough data with fewer than two readings in the range, however many are outside it", () => {
    const outside = [{ date: "2025-01-02", miles: 30_000 }, { date: "2025-06-02", miles: 35_000 }, { date: "2026-02-01", miles: 41_000 }];
    expect(costPerMile([rec(1, "2026-01-05", ["X"], 7000)], outside, range)).toEqual({ status: "not-enough-data", cents: 7000 });
    expect(costPerMile([], [], range)).toEqual({ status: "not-enough-data", cents: 0 });
  });

  it("[AC-MIL-10.4] says not enough data when no miles were driven, instead of dividing by zero", () => {
    expect(costPerMile([rec(1, "2026-01-05", ["X"], 7000)], [{ date: "2026-01-02", miles: 40_000 }, { date: "2026-01-09", miles: 40_000 }], range).status).toBe("not-enough-data");
  });

  it("[AC-MIL-10.4] a service with no cost adds nothing to the spend", () => {
    expect(costPerMile([rec(1, "2026-01-05", ["X"], null)], readings, range)).toMatchObject({ status: "ok", centsPerMile: 0, cents: 0 });
  });
});
