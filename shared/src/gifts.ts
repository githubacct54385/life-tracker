import { z } from "zod";

// Request and response shapes for the regular-gift endpoints (GIV-01), and the grouping the Giving screen shows.
// Money is integer cents (ADR-0007). Used by the API client, the demo API and the Worker.

/** The largest gift the database accepts: $1,000,000.00. */
export const MAX_GIFT_CENTS = 100_000_000;

export const PAYMENT_METHODS = ["check", "card"] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** A real calendar date, "YYYY-MM-DD". A date only: the form never asks for a time (AC-GIV-01.1). */
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }, "Not a calendar date");

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const centsSchema = z.number().int().min(1).max(MAX_GIFT_CENTS);

export const giftSchema = z.object({
  id: z.number().int().positive(),
  dateGiven: dateSchema,
  /** The month the gift is for, "YYYY-MM". It can differ from the date given (AC-GIV-01.2). */
  forMonth: monthSchema,
  cents: centsSchema,
  method: paymentMethodSchema,
});
export type GiftRecord = z.infer<typeof giftSchema>;

/** Body of POST /api/gifts and PUT /api/gifts/:id. */
export const saveGiftRequestSchema = z
  .object({ dateGiven: dateSchema, forMonth: monthSchema, cents: centsSchema, method: paymentMethodSchema })
  .strict();
export type SaveGiftRequest = z.infer<typeof saveGiftRequestSchema>;

export const giftListResponseSchema = z.object({ gifts: z.array(giftSchema) });
export type GiftListResponse = z.infer<typeof giftListResponseSchema>;

export interface GiftMonth {
  month: string;
  cents: number;
  gifts: GiftRecord[];
}

/**
 * Gifts grouped by the month they are for, newest month first. Within a month, newest date given first.
 * The month total is the sum of its gifts (AC-GIV-01.3).
 */
export function groupGiftsByMonth(gifts: readonly GiftRecord[]): GiftMonth[] {
  const byMonth = new Map<string, GiftMonth>();
  for (const gift of gifts) {
    const entry = byMonth.get(gift.forMonth) ?? { month: gift.forMonth, cents: 0, gifts: [] };
    entry.cents += gift.cents;
    entry.gifts.push(gift);
    byMonth.set(gift.forMonth, entry);
  }
  const newestFirst = (a: GiftRecord, b: GiftRecord) => (a.dateGiven === b.dateGiven ? b.id - a.id : a.dateGiven < b.dateGiven ? 1 : -1);
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : -1)).map((m) => ({ ...m, gifts: [...m.gifts].sort(newestFirst) }));
}
