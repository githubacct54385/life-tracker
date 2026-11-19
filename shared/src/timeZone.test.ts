import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calendarDateIn, isValidTimeZone } from "./timeZone";

describe("calendarDateIn", () => {
  it("[AC-SET-01.5] gives the calendar day in the zone, which can differ from the day in UTC", () => {
    const instant = new Date("2026-11-14T03:30:00Z"); // evening of the 13th in Los Angeles, already the 14th in Tokyo
    expect(calendarDateIn("America/Los_Angeles", instant)).toBe("2026-11-13");
    expect(calendarDateIn("UTC", instant)).toBe("2026-11-14");
    expect(calendarDateIn("Asia/Tokyo", instant)).toBe("2026-11-14");
    expect(calendarDateIn("America/Chicago", instant)).toBe("2026-11-13");
  });

  it("[AC-SET-01.5] follows daylight saving: the same clock time is a different UTC instant in summer and winter", () => {
    expect(calendarDateIn("America/Los_Angeles", new Date("2026-07-01T06:59:00Z"))).toBe("2026-06-30");
    expect(calendarDateIn("America/Los_Angeles", new Date("2026-07-01T07:01:00Z"))).toBe("2026-07-01");
    expect(calendarDateIn("America/Los_Angeles", new Date("2026-12-01T07:59:00Z"))).toBe("2026-11-30");
    expect(calendarDateIn("America/Los_Angeles", new Date("2026-12-01T08:01:00Z"))).toBe("2026-12-01");
  });

  it("[AC-SET-01.5] property: the result is always a calendar date, and differs from UTC by at most one day", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date("2020-01-01"), max: new Date("2035-01-01"), noInvalidDate: true }), fc.constantFrom("UTC", "Asia/Tokyo", "America/Los_Angeles", "Pacific/Auckland", "America/St_Johns"), (instant, zone) => {
        const local = calendarDateIn(zone, instant);
        expect(local).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const diff = Math.abs(Date.parse(local) - Date.parse(calendarDateIn("UTC", instant))) / 86_400_000;
        expect(diff).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe("isValidTimeZone", () => {
  it("[AC-SET-01.5] accepts real zones", () => {
    for (const zone of ["UTC", "America/Chicago", "Europe/London", "Asia/Kolkata", "America/Argentina/Buenos_Aires"]) expect(isValidTimeZone(zone), zone).toBe(true);
  });

  it("[AC-SET-01.5] refuses anything else, including odd input a caller could send", () => {
    for (const bad of ["", " ", "Not/AZone", "America/Chicago; DROP TABLE", "../etc/passwd", "a".repeat(65), "América/Chicago", undefined, null, 5, {}]) {
      expect(isValidTimeZone(bad), String(bad)).toBe(false);
    }
  });
});
