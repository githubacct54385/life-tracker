import { describe, expect, it } from "vitest";
import { fakeGiftRepo } from "../testing/fakeGiftRepository";
import { createGiftService } from "./giftService";

// Invented amounts, in integer cents.
const gift = { dateGiven: "2026-02-03", forMonth: "2026-01", cents: 10_000, method: "check" as const };

describe("giftService", () => {
  it("[AC-GIV-01.1][AC-GIV-01.2] stores a gift as entered: the month it is for can differ from the date given", async () => {
    const service = createGiftService(fakeGiftRepo());
    expect(await service.create(gift)).toEqual({ id: 1, ...gift });
    expect(await service.list()).toEqual([{ id: 1, ...gift }]);
  });

  it("[AC-GIV-01.3] several gifts for one month all exist", async () => {
    const service = createGiftService(fakeGiftRepo());
    await service.create(gift);
    await service.create({ ...gift, dateGiven: "2026-01-20", cents: 5_000, method: "card" });
    const list = await service.list();
    expect(list).toHaveLength(2);
    expect(list.filter((g) => g.forMonth === "2026-01").reduce((sum, g) => sum + g.cents, 0)).toBe(15_000);
  });

  it("[AC-GIV-01.4] edit replaces every field of the gift, and says so when it does not exist", async () => {
    const service = createGiftService(fakeGiftRepo([gift]));
    const changed = { dateGiven: "2026-03-01", forMonth: "2026-02", cents: 12_500, method: "card" as const };
    expect(await service.edit(1, changed)).toEqual({ id: 1, ...changed });
    expect(await service.edit(99, changed)).toBeUndefined();
  });

  it("[AC-GIV-01.4] delete removes the gift for good, and says so when it does not exist", async () => {
    const service = createGiftService(fakeGiftRepo([gift]));
    expect(await service.remove(1)).toBe(true);
    expect(await service.remove(1)).toBe(false);
    expect(await service.list()).toEqual([]);
  });
});
