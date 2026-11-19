// The owner's time zone decides which calendar day "now" is (ADR-0007). The browser sends its Settings value with every
// request in this header, and the API uses it, when it is a real zone, to date a new reading, weight or workout.
export const TIME_ZONE_HEADER = "x-owner-time-zone";

/** True for a real IANA zone such as "America/Chicago". Anything else (empty, too long, odd characters, unknown) is false. */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone.length === 0 || zone.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date ("YYYY-MM-DD") of an instant in a time zone. */
export function calendarDateIn(timeZone: string, instant: Date): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}
