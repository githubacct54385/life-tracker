import { MAX_ODOMETER_MILES, type ReadingWarning } from "@life-tracker/shared";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-06" -> "Nov 6". Pure text work, so no time zone can shift the day. */
export function shortDate(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${MONTHS[(month ?? 1) - 1]} ${day}`;
}

export const formatMiles = (miles: number) => miles.toLocaleString("en-US");

/** What the owner typed -> whole miles, or undefined when it is not a usable reading. Commas and spaces are ignored. */
export function parseMiles(text: string): number | undefined {
  const cleaned = text.replace(/[,\s]/g, "");
  if (!/^\d{1,7}$/.test(cleaned)) return undefined;
  const miles = Number(cleaned);
  return miles <= MAX_ODOMETER_MILES ? miles : undefined;
}

export function describeWarning(warning: ReadingWarning): { title: string; detail: string } {
  switch (warning.kind) {
    case "lower_than_previous":
      return {
        title: "Lower than your last reading",
        detail: `Last reading was ${formatMiles(warning.previous.miles)} on ${shortDate(warning.previous.date)}.`,
      };
    case "higher_than_next":
      return {
        title: "Higher than the next reading",
        detail: `The next reading is ${formatMiles(warning.next.miles)} on ${shortDate(warning.next.date)}.`,
      };
    case "implausible_jump":
      return {
        title: "That is a big jump",
        detail: `${formatMiles(warning.miles)} miles in ${warning.days} ${warning.days === 1 ? "day" : "days"}.`,
      };
  }
}
