import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { giftsForMonth, givingYearToDate, monthlyRegularGiving, type RegularGift, type SpecialContribution } from "./giving";

// Invented amounts, in integer cents (ADR-0007).
const gift = (dateGiven: string, forMonth: string, cents: number): RegularGift => ({ dateGiven, forMonth, cents });
const special = (dateGiven: string, occasion: string, cents: number): SpecialContribution => ({ dateGiven, occasion, cents });

describe("monthlyRegularGiving", () => {
  it("[AC-GIV-03.1] groups regular gifts by the month they are for, not the date given, and sums several gifts in one month", () => {
    const gifts = [gift("2026-02-03", "2026-01", 10_000), gift("2026-01-20", "2026-01", 5_000), gift("2026-02-20", "2026-02", 12_000)];
    const months = monthlyRegularGiving(gifts, { year: 2026, today: "2026-03-10" });
    expect(months.slice(0, 3)).toEqual([
      { month: "2026-01", cents: 15_000, count: 2, noGift: false },
      { month: "2026-02", cents: 12_000, count: 1, noGift: false },
      { month: "2026-03", cents: 0, count: 0, noGift: true },
    ]);
  });

  it("[AC-GIV-03.3] marks a past or current month with no regular gift as 'no gift', and leaves future months alone", () => {
    const months = monthlyRegularGiving([gift("2026-01-05", "2026-01", 100)], { year: 2026, today: "2026-04-15" });
    expect(months.map((m) => m.noGift)).toEqual([false, true, true, true, false, false, false, false, false, false, false, false]);
    expect(months).toHaveLength(12);
    expect(months[11]).toEqual({ month: "2026-12", cents: 0, count: 0, noGift: false });
  });

  it("[AC-GIV-03.3] does not flag months before the first regular gift ever recorded", () => {
    const gifts = [gift("2025-11-05", "2025-11", 100), gift("2026-03-05", "2026-03", 100)];
    expect(monthlyRegularGiving(gifts, { year: 2025, today: "2026-04-15" }).filter((m) => m.noGift).map((m) => m.month)).toEqual(["2025-12"]);
    const lateStart = monthlyRegularGiving([gift("2026-03-05", "2026-03", 100)], { year: 2026, today: "2026-04-15" });
    expect(lateStart.filter((m) => m.noGift).map((m) => m.month)).toEqual(["2026-04"]);
    expect(monthlyRegularGiving([], { year: 2026, today: "2026-04-15" }).some((m) => m.noGift)).toBe(false);
  });

  it("[AC-GIV-03.1] ignores gifts for other years, and rejects bad months and amounts", () => {
    expect(monthlyRegularGiving([gift("2025-12-30", "2025-12", 100)], { year: 2026, today: "2026-02-01" }).every((m) => m.count === 0)).toBe(true);
    expect(() => monthlyRegularGiving([gift("2026-01-05", "2026-13", 100)], { year: 2026, today: "2026-02-01" })).toThrow(/month/i);
    expect(() => monthlyRegularGiving([gift("2026-01-05", "2026-01", 10.5)], { year: 2026, today: "2026-02-01" })).toThrow(/cents/i);
    expect(() => monthlyRegularGiving([gift("2026-01-05", "2026-01", -5)], { year: 2026, today: "2026-02-01" })).toThrow(/cents/i);
  });
});

describe("givingYearToDate", () => {
  it("[AC-GIV-03.2] totals regular, special and combined for the year", () => {
    const regular = [gift("2026-01-20", "2026-01", 10_000), gift("2026-02-20", "2026-02", 10_000), gift("2025-12-20", "2025-12", 99_999)];
    const specials = [special("2026-03-01", "Spring offering", 25_000), special("2025-11-01", "Autumn offering", 77_777)];
    expect(givingYearToDate(regular, specials, { year: 2026 })).toEqual({ regularCents: 20_000, specialCents: 25_000, combinedCents: 45_000 });
  });

  it("[AC-GIV-03.2] is zero for a year with no gifts, and special contributions are counted by the date given", () => {
    expect(givingYearToDate([], [], { year: 2026 })).toEqual({ regularCents: 0, specialCents: 0, combinedCents: 0 });
    expect(givingYearToDate([], [special("2026-01-02", "Offering", 500)], { year: 2025 }).specialCents).toBe(0);
    expect(() => givingYearToDate([], [special("2026-01-02", "Offering", 0.5)], { year: 2026 })).toThrow(/cents/i);
  });

  it("[AC-GIV-03.1][AC-GIV-03.2] monthly totals add up to the regular year total, in any entry order", () => {
    const giftArb = fc.record({ month: fc.integer({ min: 1, max: 12 }), delay: fc.integer({ min: 0, max: 40 }), cents: fc.integer({ min: 1, max: 1_000_000 }) }).map(({ month, delay, cents }) => {
      const forMonth = `2026-${String(month).padStart(2, "0")}`;
      return gift(new Date(Date.UTC(2026, month - 1, 1 + delay)).toISOString().slice(0, 10), forMonth, cents);
    });
    fc.assert(
      fc.property(fc.array(giftArb, { maxLength: 30 }), (gifts) => {
        const months = monthlyRegularGiving(gifts, { year: 2026, today: "2026-12-31" });
        const sum = months.reduce((s, m) => s + m.cents, 0);
        expect(sum).toBe(givingYearToDate(gifts, [], { year: 2026 }).regularCents);
        expect(months).toEqual(monthlyRegularGiving([...gifts].reverse(), { year: 2026, today: "2026-12-31" }));
      }),
    );
  });
});

describe("giftsForMonth", () => {
  it("[AC-GIV-03.1] lists each gift made for a month, oldest first, so the month total can be opened up", () => {
    const gifts = [gift("2026-02-03", "2026-01", 10_000), gift("2026-01-20", "2026-01", 5_000), gift("2026-02-20", "2026-02", 12_000)];
    expect(giftsForMonth(gifts, "2026-01")).toEqual([gift("2026-01-20", "2026-01", 5_000), gift("2026-02-03", "2026-01", 10_000)]);
    expect(giftsForMonth(gifts, "2026-01").reduce((s, g) => s + g.cents, 0)).toBe(monthlyRegularGiving(gifts, { year: 2026, today: "2026-03-01" })[0]!.cents);
    expect(giftsForMonth(gifts, "2026-03")).toEqual([]);
    expect(() => giftsForMonth(gifts, "2026-1")).toThrow(/month/i);
  });
});
