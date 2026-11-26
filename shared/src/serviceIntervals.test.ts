import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { MaintenanceRecord } from "./maintenance.js";
import { addMonths, averageMilesPerDay, calendarDate, dueCalendarFile, mostUrgent, nextDue, saveServiceIntervalRequestSchema, type ServiceInterval } from "./serviceIntervals.js";

const rec = (id: number, date: string, services: string[], odometerMiles: number | null = null): MaintenanceRecord => ({ id, date, services, doneBy: "home", place: null, costCents: 12_345, odometerMiles, note: "private note" });
const interval = (service: string, miles: number | null, months: number | null, id = 1): ServiceInterval => ({ id, service, miles, months });
const TODAY = "2026-11-26";

describe("addMonths", () => {
  it("[AC-MIL-09.2] adds calendar months and keeps the day, or the last day of a shorter month", () => {
    expect(addMonths("2026-05-15", 6)).toBe("2026-11-15");
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonths("2027-08-31", 6)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
  });
});

describe("averageMilesPerDay", () => {
  it("[AC-MIL-09.3] is the odometer change over the days between the first and last reading of the last 90 days", () => {
    const readings = [{ date: "2026-08-01", miles: 1 }, { date: "2026-09-01", miles: 1000 }, { date: "2026-11-26", miles: 1_900 }];
    // The 2026-08-01 reading is more than 90 days before today, so it is left out: 900 miles over 86 days.
    expect(averageMilesPerDay(readings, TODAY)).toBeCloseTo(900 / 86, 6);
  });

  it("[AC-MIL-09.3] is undefined with too little data: no readings, one reading, or readings on one day", () => {
    expect(averageMilesPerDay([], TODAY)).toBeUndefined();
    expect(averageMilesPerDay([{ date: "2026-11-01", miles: 10 }], TODAY)).toBeUndefined();
    expect(averageMilesPerDay([{ date: "2026-11-01", miles: 10 }, { date: "2026-11-01", miles: 20 }], TODAY)).toBeUndefined();
    expect(averageMilesPerDay([{ date: "2025-01-01", miles: 10 }, { date: "2025-02-01", miles: 900 }], TODAY)).toBeUndefined();
  });

  it("[AC-MIL-09.3] is never negative", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ day: fc.integer({ min: 0, max: 120 }), miles: fc.integer({ min: 0, max: 200_000 }) }), { maxLength: 8 }), (rows) => {
        const readings = rows.map((r) => ({ date: new Date(Date.parse("2026-07-30T00:00:00Z") + r.day * 86_400_000).toISOString().slice(0, 10), miles: r.miles }));
        const average = averageMilesPerDay(readings, TODAY);
        return average === undefined || average >= 0;
      }),
    );
  });
});

describe("nextDue", () => {
  it("[AC-MIL-09.1] lists only the types that have an interval", () => {
    const rows = nextDue([rec(1, "2026-10-01", ["Oil change", "Tires"], 40_000)], [interval("Oil change", 5000, null)], 41_000, undefined, TODAY);
    expect(rows.map((r) => r.service)).toEqual(["Oil change"]);
    expect(nextDue([rec(1, "2026-10-01", ["Tires"], 40_000)], [], 41_000, undefined, TODAY)).toEqual([]);
  });

  it("[AC-MIL-09.2] is due by the mileage (last mileage plus the interval) and by the date (last date plus the months)", () => {
    const [row] = nextDue([rec(1, "2026-08-15", ["Oil change"], 40_000)], [interval("Oil change", 5000, 6)], 42_000, undefined, TODAY);
    expect(row).toMatchObject({ dueMiles: 45_000, milesLeft: 3000, dueDate: "2027-02-15", daysLeft: 81, state: "ok" });
  });

  it("[AC-MIL-09.2] uses the most recent service of the type, matched ignoring letter case, and a service listed with others counts", () => {
    const records = [rec(1, "2026-01-10", ["oil change"], 30_000), rec(2, "2026-09-01", ["Tires", "Oil Change"], 44_000)];
    const [row] = nextDue(records, [interval("Oil change", 5000, null)], 45_000, undefined, TODAY);
    expect(row).toMatchObject({ lastDate: "2026-09-01", dueMiles: 49_000, milesLeft: 4000 });
  });

  it("[AC-MIL-09.2] says so, instead of guessing, for a type that was never logged", () => {
    const [row] = nextDue([], [interval("Oil change", 5000, 6)], 42_000, 30, TODAY);
    expect(row).toMatchObject({ state: "never-logged", lastDate: null, dueMiles: null, dueDate: null, estimatedDate: null });
  });

  it("[AC-MIL-09.2] a miles-only interval needs the mileage kept with the last service, and says so when it is missing", () => {
    expect(nextDue([rec(1, "2026-10-01", ["Oil change"])], [interval("Oil change", 5000, null)], 42_000, undefined, TODAY)[0]!.state).toBe("needs-mileage");
    expect(nextDue([rec(1, "2026-10-01", ["Oil change"], 40_000)], [interval("Oil change", 5000, null)], undefined, undefined, TODAY)[0]!.state).toBe("needs-mileage");
    // With a months interval too, the date still works.
    expect(nextDue([rec(1, "2026-10-01", ["Oil change"])], [interval("Oil change", 5000, 6)], 42_000, undefined, TODAY)[0]).toMatchObject({ state: "ok", dueDate: "2027-04-01" });
  });

  it("[AC-MIL-09.3] shows the due mileage as an estimated date at the recent pace, and the mileage only without one", () => {
    const records = [rec(1, "2026-11-01", ["Oil change"], 40_000)];
    expect(nextDue(records, [interval("Oil change", 5000, null)], 42_000, 30, TODAY)[0]).toMatchObject({ milesLeft: 3000, estimatedDate: "2027-03-06", daysUntilDue: 100 });
    expect(nextDue(records, [interval("Oil change", 5000, null)], 42_000, undefined, TODAY)[0]).toMatchObject({ milesLeft: 3000, estimatedDate: null });
    expect(nextDue(records, [interval("Oil change", 5000, null)], 42_000, 0, TODAY)[0]!.estimatedDate).toBeNull();
  });

  it("[AC-MIL-09.4] is Due soon within 500 miles or 30 days, and Overdue past either", () => {
    const at = (odometer: number, serviceDate = "2026-11-01") => nextDue([rec(1, serviceDate, ["Oil change"], 40_000)], [interval("Oil change", 5000, 6)], odometer, undefined, TODAY)[0]!.state;
    expect(at(44_400)).toBe("ok");
    expect(at(44_500)).toBe("due-soon");
    expect(at(45_000)).toBe("due-soon");
    expect(at(45_001)).toBe("overdue");
    // By date: serviced 2026-05-27, due 2026-11-27, which is tomorrow.
    expect(at(41_000, "2026-05-27")).toBe("due-soon");
    expect(at(41_000, "2026-05-25")).toBe("overdue");
    expect(at(41_000, "2026-06-27")).toBe("ok");
  });

  it("[AC-MIL-09.4] is due by whichever comes first: a close date makes it due soon even with plenty of miles left", () => {
    const [row] = nextDue([rec(1, "2026-05-30", ["Oil change"], 40_000)], [interval("Oil change", 5000, 6)], 40_100, undefined, TODAY);
    expect(row).toMatchObject({ milesLeft: 4900, daysLeft: 4, state: "due-soon" });
  });

  it("[AC-MIL-09.2] is never due before the service it follows (the due mileage and date are after the last ones)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 150_000 }), fc.integer({ min: 1, max: 20_000 }), fc.integer({ min: 1, max: 24 }), (miles, milesInterval, months) => {
        const [row] = nextDue([rec(1, "2026-03-31", ["X"], miles)], [interval("X", milesInterval, months)], miles, undefined, "2026-03-31");
        return row!.dueMiles! > miles && row!.dueDate! > "2026-03-31";
      }),
    );
  });

  it("[AC-MIL-09.4] sorts overdue first, then due soon, then ok, then the types that cannot be judged", () => {
    const records = [rec(1, "2026-11-01", ["A"], 40_000), rec(2, "2026-11-01", ["B"], 40_000), rec(3, "2026-11-01", ["C"], 40_000), rec(4, "2026-11-01", ["E"])];
    const intervals = [interval("A", 9000, null, 1), interval("B", 1000, null, 2), interval("C", 1500, null, 3), interval("D", 1000, null, 4), interval("E", 1000, null, 5)];
    expect(nextDue(records, intervals, 41_200, undefined, TODAY).map((r) => [r.service, r.state])).toEqual([["B", "overdue"], ["C", "due-soon"], ["A", "ok"], ["E", "needs-mileage"], ["D", "never-logged"]]);
  });
});

describe("mostUrgent", () => {
  it("[AC-MIL-09.5] keeps up to three that are overdue or due soon, most urgent first, and nothing when none is", () => {
    const records = ["A", "B", "C", "D", "E"].map((s, i) => rec(i + 1, "2026-11-01", [s], 40_000));
    const intervals = ["A", "B", "C", "D", "E"].map((s, i) => interval(s, [900, 800, 700, 600, 20_000][i]!, null, i + 1));
    const rows = nextDue(records, intervals, 41_000, undefined, TODAY);
    // Past due by 400, 300, 200 and 100 miles: the one furthest past comes first.
    expect(mostUrgent(rows).map((r) => r.service)).toEqual(["D", "C", "B"]);
    expect(mostUrgent(rows, 10).map((r) => r.service)).toEqual(["D", "C", "B", "A"]);
    expect(mostUrgent(nextDue(records, [interval("E", 20_000, null)], 41_000, undefined, TODAY))).toEqual([]);
    expect(mostUrgent([])).toEqual([]);
  });
});

describe("calendar file", () => {
  it("[AC-MIL-09.6] picks the sooner of the due date and the estimated date for the calendar", () => {
    expect(calendarDate({ dueDate: "2027-02-15", estimatedDate: "2027-01-10" } as never)).toBe("2027-01-10");
    expect(calendarDate({ dueDate: null, estimatedDate: "2027-01-10" } as never)).toBe("2027-01-10");
    expect(calendarDate({ dueDate: null, estimatedDate: null } as never)).toBeNull();
  });

  it("[AC-MIL-09.6] holds only the service name and the date, never a place, cost, note or mileage", () => {
    const file = dueCalendarFile("Oil change", "2027-02-15");
    expect(file).toContain("BEGIN:VCALENDAR");
    expect(file).toContain("DTSTART;VALUE=DATE:20270215");
    expect(file).toContain("DTEND;VALUE=DATE:20270216");
    expect(file).toContain("SUMMARY:Oil change due");
    expect(file).not.toMatch(/12345|private note|45000|LOCATION|DESCRIPTION/);
    expect(file.endsWith("\r\n")).toBe(true);
  });

  it("[AC-MIL-09.6] escapes characters that mean something in a calendar file, and keeps the event on the right day at a month end", () => {
    expect(dueCalendarFile("Brakes, front; rear\nnow", "2026-12-31")).toContain("SUMMARY:Brakes\\, front\\; rear now due");
    expect(dueCalendarFile("X", "2026-12-31")).toContain("DTEND;VALUE=DATE:20270101");
  });
});

describe("saveServiceIntervalRequestSchema", () => {
  it("[AC-MIL-09.7] accepts miles, months or both, and trims the name", () => {
    expect(saveServiceIntervalRequestSchema.parse({ service: " Oil change ", miles: 5000 })).toEqual({ service: "Oil change", miles: 5000 });
    expect(saveServiceIntervalRequestSchema.safeParse({ service: "Oil change", months: 6 }).success).toBe(true);
    expect(saveServiceIntervalRequestSchema.safeParse({ service: "Oil change", miles: 5000, months: 6 }).success).toBe(true);
  });

  it("[AC-MIL-09.7] refuses no interval, zero, a decimal, too large, a blank name and extra fields", () => {
    const bad = [{ service: "Oil change" }, { service: "Oil change", miles: 0 }, { service: "Oil change", months: 2.5 }, { service: "Oil change", miles: 200_001 }, { service: "Oil change", months: 121 }, { service: "  ", miles: 5000 }, { service: "Oil change", miles: 5000, id: 3 }];
    for (const body of bad) expect(saveServiceIntervalRequestSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
  });
});
