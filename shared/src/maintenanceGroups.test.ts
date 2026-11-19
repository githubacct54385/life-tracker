import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { MaintenanceRecord } from "./maintenance.js";
import { groupByMonth, groupByPlace, groupByService, monthTitle } from "./maintenanceGroups.js";
import { filterHistory, matchesText } from "./maintenanceHistory.js";

const rec = (id: number, date: string, services: string[], extra: Partial<MaintenanceRecord> = {}): MaintenanceRecord => ({ id, date, services, doneBy: "home", place: null, costCents: null, odometerMiles: null, note: null, ...extra });
const joes = { id: 1, name: "Joe's Garage" };
const acme = { id: 2, name: "Acme Tire" };
const records = [
  rec(1, "2026-10-09", ["Brakes"], { doneBy: "shop", place: joes, costCents: 21_400 }),
  rec(2, "2026-11-03", ["Oil change"], { doneBy: "shop", place: joes, costCents: 8_900 }),
  rec(3, "2026-11-12", ["Rotate tires", "Multi-point inspection"], { doneBy: "shop", place: acme, costCents: 3_900 }),
  rec(4, "2026-08-20", ["Wipers"], { costCents: 1_800 }),
  rec(5, "2026-09-02", ["Oil change"], { doneBy: "shop" }),
];

describe("groupByMonth", () => {
  it("[AC-MIL-06.7] puts each service under its month, newest month first, with the count and total cost", () => {
    const groups = groupByMonth(records);
    expect(groups.map((g) => g.title)).toEqual(["November 2026", "October 2026", "September 2026", "August 2026"]);
    expect(groups[0]!.records.map((r) => r.id)).toEqual([3, 2]);
    expect(groups[0]!.totalCents).toBe(12_800);
    expect(groups[2]!.totalCents).toBe(0); // a service with no cost adds nothing
  });

  it("[AC-MIL-06.7] names a month in words", () => {
    expect(monthTitle("2026-01-31")).toBe("January 2026");
    expect(monthTitle("2026-12")).toBe("December 2026");
  });

  it("[AC-MIL-06.7] orders two services on one day by id, newest first", () => {
    const [group] = groupByMonth([rec(1, "2026-11-03", ["A"]), rec(7, "2026-11-03", ["B"]), rec(4, "2026-11-03", ["C"])]);
    expect(group!.records.map((r) => r.id)).toEqual([7, 4, 1]);
  });
});

describe("groupByPlace", () => {
  it("[AC-MIL-06.8] has one group per shop, one for done at home and one for no place named, the latest visit first", () => {
    const groups = groupByPlace(records);
    expect(groups.map((g) => [g.title, g.records.length, g.totalCents, g.lastDate])).toEqual([
      ["Acme Tire", 1, 3_900, "2026-11-12"],
      ["Joe's Garage", 2, 30_300, "2026-11-03"],
      ["No place named", 1, 0, "2026-09-02"],
      ["Done at home", 1, 1_800, "2026-08-20"],
    ]);
  });

  it("[AC-MIL-06.8] keeps a renamed shop as one group, because it is grouped by id", () => {
    const groups = groupByPlace([rec(1, "2026-01-01", ["A"], { doneBy: "shop", place: { id: 9, name: "New name" } }), rec(2, "2026-02-01", ["A"], { doneBy: "shop", place: { id: 9, name: "New name" } })]);
    expect(groups).toHaveLength(1);
  });
});

describe("groupByService", () => {
  it("[AC-MIL-06.8] has one group per kind of service, and a visit that did two things is in both", () => {
    const groups = groupByService(records);
    expect(groups.map((g) => [g.title, g.records.length])).toEqual([
      ["Multi-point inspection", 1],
      ["Rotate tires", 1],
      ["Oil change", 2],
      ["Brakes", 1],
      ["Wipers", 1],
    ]);
    expect(groups.find((g) => g.title === "Oil change")!.lastDate).toBe("2026-11-03");
  });

  it("[AC-MIL-06.8] treats the owner's own spelling ignoring letter case as one kind", () => {
    const groups = groupByService([rec(1, "2026-01-01", ["Cabin filter"]), rec(2, "2026-02-01", ["cabin FILTER "])]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.records).toHaveLength(2);
  });

  it("[AC-MIL-06.8] makes no groups from no services", () => {
    expect(groupByMonth([])).toEqual([]);
    expect(groupByPlace([])).toEqual([]);
    expect(groupByService([])).toEqual([]);
  });
});

describe("grouping keeps every service", () => {
  const arbRecord = fc.record({
    id: fc.integer({ min: 1, max: 10_000 }),
    date: fc.tuple(fc.integer({ min: 2020, max: 2026 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 })).map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`),
    services: fc.uniqueArray(fc.constantFrom("Oil change", "Tires", "Brakes", "Wipers"), { minLength: 1, maxLength: 3 }),
    doneBy: fc.constantFrom("shop" as const, "home" as const),
    place: fc.option(fc.constantFrom(joes, acme), { nil: null }),
    costCents: fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: null }),
    odometerMiles: fc.constant(null),
    note: fc.constant(null),
  });
  const unique = (list: MaintenanceRecord[]) => list.filter((r, i) => list.findIndex((o) => o.id === r.id) === i).map((r) => (r.doneBy === "home" ? { ...r, place: null } : r));

  it("[AC-MIL-06.7][AC-MIL-06.8] by month and by place, every service is in exactly one group and the totals add up", () => {
    fc.assert(
      fc.property(fc.array(arbRecord), (raw) => {
        const list = unique(raw);
        for (const groups of [groupByMonth(list), groupByPlace(list)]) {
          expect(groups.flatMap((g) => g.records.map((r) => r.id)).sort()).toEqual(list.map((r) => r.id).sort());
          expect(groups.reduce((sum, g) => sum + g.totalCents, 0)).toBe(list.reduce((sum, r) => sum + (r.costCents ?? 0), 0));
          groups.forEach((g) => expect(g.records.map((r) => r.date)).toEqual([...g.records.map((r) => r.date)].sort().reverse()));
        }
      }),
    );
  });

  it("[AC-MIL-06.8] by service, a visit appears once for each thing it did", () => {
    fc.assert(
      fc.property(fc.array(arbRecord), (raw) => {
        const list = unique(raw);
        const placed = groupByService(list).reduce((n, g) => n + g.records.length, 0);
        expect(placed).toBe(list.reduce((n, r) => n + r.services.length, 0));
      }),
    );
  });
});

describe("search text", () => {
  const r = rec(1, "2026-11-03", ["Oil change", "Wipers"], { doneBy: "shop", place: joes, note: "Used synthetic" });

  it("[AC-MIL-06.10] finds a service by what was done, the place or the note, ignoring letter case", () => {
    expect(matchesText(r, "wiper")).toBe(true);
    expect(matchesText(r, "JOE")).toBe(true);
    expect(matchesText(r, "synthetic")).toBe(true);
    expect(matchesText(r, "brakes")).toBe(false);
  });

  it("[AC-MIL-06.10] finds a service done at home by the words at home, and treats blank text as no search", () => {
    expect(matchesText(rec(2, "2026-11-03", ["Wipers"]), "at home")).toBe(true);
    expect(matchesText(r, "   ")).toBe(true);
  });

  it("[AC-MIL-06.10] works together with the service and place filters", () => {
    const list = [r, rec(2, "2026-11-04", ["Oil change"], { doneBy: "shop", place: acme }), rec(3, "2026-11-05", ["Oil change"], { doneBy: "shop", place: joes })];
    expect(filterHistory(list, { service: "Oil change", text: "joe" }).map((x) => x.id)).toEqual([1, 3]);
    expect(filterHistory(list, { service: "Oil change", placeId: 1, text: "wipers" }).map((x) => x.id)).toEqual([1]);
    expect(filterHistory(list, { text: "" })).toHaveLength(3);
  });
});
