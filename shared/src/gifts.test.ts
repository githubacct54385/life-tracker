import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { groupGiftsByMonth, saveGiftRequestSchema, type GiftRecord } from "./gifts";

// Invented amounts, in integer cents (ADR-0007).
const gift = (id: number, dateGiven: string, forMonth: string, cents: number): GiftRecord => ({ id, dateGiven, forMonth, cents, method: "check" });

describe("saveGiftRequestSchema", () => {
  const valid = { dateGiven: "2026-02-03", forMonth: "2026-01", cents: 10_000, method: "card" };

  it("[AC-GIV-01.1] takes a date (never a time), a month it is for, an amount and a payment method", () => {
    expect(saveGiftRequestSchema.parse(valid)).toEqual(valid);
    expect(saveGiftRequestSchema.safeParse({ ...valid, method: "check" }).success).toBe(true);
    expect(saveGiftRequestSchema.safeParse({ ...valid, method: "cash" }).success).toBe(false);
    expect(saveGiftRequestSchema.safeParse({ ...valid, dateGiven: "2026-02-03T10:00:00Z" }).success).toBe(false);
    expect(saveGiftRequestSchema.safeParse({ ...valid, dateGiven: "2026-02-30" }).success).toBe(false);
  });

  it("[AC-GIV-01.1] rejects a missing field and an unknown one", () => {
    const withoutMethod: Record<string, unknown> = { ...valid };
    delete withoutMethod.method;
    expect(saveGiftRequestSchema.safeParse(withoutMethod).success).toBe(false);
    expect(saveGiftRequestSchema.safeParse({ ...valid, time: "10:00" }).success).toBe(false);
  });

  it("[AC-GIV-01.2] the month it is for may differ from the date given", () => {
    expect(saveGiftRequestSchema.safeParse({ ...valid, dateGiven: "2026-02-03", forMonth: "2025-12" }).success).toBe(true);
    expect(saveGiftRequestSchema.safeParse({ ...valid, forMonth: "2026-13" }).success).toBe(false);
    expect(saveGiftRequestSchema.safeParse({ ...valid, forMonth: "2026-1" }).success).toBe(false);
  });

  it("[AC-GIV-01.1] the amount is a positive whole number of cents", () => {
    for (const cents of [0, -1, 1.5, "100", 100_000_001, null]) expect(saveGiftRequestSchema.safeParse({ ...valid, cents }).success).toBe(false);
    expect(saveGiftRequestSchema.safeParse({ ...valid, cents: 1 }).success).toBe(true);
  });
});

describe("groupGiftsByMonth", () => {
  it("[AC-GIV-01.3] several gifts for one month are listed together and the month total is their sum", () => {
    const months = groupGiftsByMonth([gift(1, "2026-02-03", "2026-01", 10_000), gift(2, "2026-01-20", "2026-01", 5_000), gift(3, "2026-02-20", "2026-02", 12_000)]);
    expect(months.map((m) => [m.month, m.cents, m.gifts.map((g) => g.id)])).toEqual([
      ["2026-02", 12_000, [3]],
      ["2026-01", 15_000, [1, 2]],
    ]);
  });

  it("[AC-GIV-01.2] groups by the month it is for, not the date given", () => {
    const months = groupGiftsByMonth([gift(1, "2026-02-03", "2026-01", 100)]);
    expect(months).toEqual([{ month: "2026-01", cents: 100, gifts: [gift(1, "2026-02-03", "2026-01", 100)] }]);
  });

  it("[AC-GIV-01.3] an empty list has no months", () => {
    expect(groupGiftsByMonth([])).toEqual([]);
  });

  it("[AC-GIV-01.3] property: month totals add up to the total of all gifts, and no gift is lost", () => {
    const monthArb = fc.integer({ min: 1, max: 12 }).map((m) => `2026-${String(m).padStart(2, "0")}`);
    const giftArb = fc.record({ forMonth: monthArb, cents: fc.integer({ min: 1, max: 1_000_000 }) });
    fc.assert(
      fc.property(fc.array(giftArb, { maxLength: 40 }), (rows) => {
        const gifts = rows.map((r, i) => gift(i + 1, "2026-06-01", r.forMonth, r.cents));
        const months = groupGiftsByMonth(gifts);
        expect(months.reduce((sum, m) => sum + m.cents, 0)).toBe(gifts.reduce((sum, g) => sum + g.cents, 0));
        expect(months.reduce((n, m) => n + m.gifts.length, 0)).toBe(gifts.length);
        expect(new Set(months.map((m) => m.month)).size).toBe(months.length);
      }),
    );
  });
});
