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

/** The longest description the database accepts, for a regular gift or a special contribution. */
export const MAX_DESCRIPTION_LENGTH = 80;
const descriptionSchema = z.string().trim().min(1).max(MAX_DESCRIPTION_LENGTH);

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const centsSchema = z.number().int().min(1).max(MAX_GIFT_CENTS);

export const giftSchema = z.object({
  id: z.number().int().positive(),
  dateGiven: dateSchema,
  /** The month the gift is for, "YYYY-MM". It can differ from the date given (AC-GIV-01.2). */
  forMonth: monthSchema,
  cents: centsSchema,
  method: paymentMethodSchema,
  /** What the gift is for, such as "November tithe". Null for a gift saved without one (AC-GIV-02.3). */
  description: descriptionSchema.nullable(),
});
export type GiftRecord = z.infer<typeof giftSchema>;

/** Body of POST /api/gifts and PUT /api/gifts/:id. */
export const saveGiftRequestSchema = z
  .object({
    dateGiven: dateSchema,
    forMonth: monthSchema,
    cents: centsSchema,
    method: paymentMethodSchema,
    /** Optional. Blank or missing is stored as no description. */
    description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).nullish(),
  })
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

// Special contributions (GIV-02): one-off offerings with a name or occasion instead of a "for" month (AC-GIV-02.1).
// They are kept apart from regular gifts, so the monthly history stays clean (AC-GIV-02.2).

/** The longest occasion name the database accepts. */
export const MAX_OCCASION_LENGTH = MAX_DESCRIPTION_LENGTH;

const occasionSchema = z.string().trim().min(1).max(MAX_OCCASION_LENGTH);

export const specialContributionSchema = z.object({
  id: z.number().int().positive(),
  dateGiven: dateSchema,
  /** What the offering was for, such as a named appeal or an occasion. Replaces the "for" month. */
  occasion: occasionSchema,
  cents: centsSchema,
  method: paymentMethodSchema,
});
export type SpecialContributionRecord = z.infer<typeof specialContributionSchema>;

/** Body of POST /api/gifts/special and PUT /api/gifts/special/:id. */
export const saveSpecialContributionRequestSchema = z
  .object({ dateGiven: dateSchema, occasion: occasionSchema, cents: centsSchema, method: paymentMethodSchema })
  .strict();
export type SaveSpecialContributionRequest = z.infer<typeof saveSpecialContributionRequestSchema>;

export const specialContributionListResponseSchema = z.object({ contributions: z.array(specialContributionSchema) });
export type SpecialContributionListResponse = z.infer<typeof specialContributionListResponseSchema>;

/** Newest date given first; on the same date, the one saved last first. */
export function sortSpecialContributions(list: readonly SpecialContributionRecord[]): SpecialContributionRecord[] {
  return [...list].sort((a, b) => (a.dateGiven === b.dateGiven ? b.id - a.id : a.dateGiven < b.dateGiven ? 1 : -1));
}

/** The total of the special contributions given in a calendar year, kept apart from regular giving (AC-GIV-02.2). */
export function specialContributionTotal(list: readonly SpecialContributionRecord[], year?: number): number {
  return list.filter((c) => year === undefined || c.dateGiven.startsWith(`${year}-`)).reduce((sum, c) => sum + c.cents, 0);
}
