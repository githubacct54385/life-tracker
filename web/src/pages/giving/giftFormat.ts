import { MAX_GIFT_CENTS, type PaymentMethod } from "@life-tracker/shared";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-01" -> "January 2026". Pure text work, so no time zone can shift the month. */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${year}`;
}

/** "2026-02-03" -> "Feb 3, 2026". */
export function dateLabel(date: string): string {
  const [year, m, day] = date.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]!.slice(0, 3)} ${day}, ${year}`;
}

/** Integer cents -> "$150.00" (ADR-0007: money is integer cents in code). */
export const formatCents = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * What the owner typed -> integer cents, or undefined when it is not a usable amount.
 * Accepts "150", "150.5", "$1,250.00". Converts from the text, never through floating point.
 */
export function parseDollars(text: string): number | undefined {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text.replace(/[$,\s]/g, ""));
  if (!match) return undefined;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents >= 1 && cents <= MAX_GIFT_CENTS ? cents : undefined;
}

/** Integer cents -> the text shown when editing, "150.00". */
export const centsToInput = (cents: number) => (cents / 100).toFixed(2);

export const METHOD_LABEL: Record<PaymentMethod, string> = { check: "Check", card: "Online card service" };

/** Today's local calendar date, "YYYY-MM-DD", the default for the date given. */
export function todayLocal(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
