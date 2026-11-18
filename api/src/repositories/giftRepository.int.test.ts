import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { giftRepository as repo } from "./giftRepository.js";
import { clearGifts, connectFreshAppDatabase, disconnectAppDatabase } from "./giftTestDatabase.js";

const server = inject("postgres");
const gift = { dateGiven: "2026-02-03", forMonth: "2026-01", cents: 10_050, method: "check" as const };

describe.skipIf(!server)("giftRepository (real Postgres, real migration, app role)", () => {
  beforeAll(() => connectFreshAppDatabase(server!));
  afterAll(disconnectAppDatabase);
  beforeEach(clearGifts);

  it("[AC-GIV-01.1][AC-GIV-01.2] stores date given, month it is for, cents and method, and returns dates as plain text", async () => {
    const saved = await repo.insert(gift);
    expect(saved).toEqual({ id: expect.any(Number), ...gift });
    expect(await repo.listAll()).toEqual([saved]);
  });

  it("[AC-GIV-01.3] allows several gifts for one month, listed newest month first", async () => {
    await repo.insert({ ...gift, forMonth: "2026-01", dateGiven: "2026-01-05" });
    await repo.insert({ ...gift, forMonth: "2026-01", dateGiven: "2026-01-20", cents: 5_000, method: "card" });
    await repo.insert({ ...gift, forMonth: "2026-02", dateGiven: "2026-02-10" });
    expect((await repo.listAll()).map((g) => [g.forMonth, g.dateGiven])).toEqual([
      ["2026-02", "2026-02-10"],
      ["2026-01", "2026-01-20"],
      ["2026-01", "2026-01-05"],
    ]);
  });

  it("[AC-GIV-01.4] edit changes every field, and returns undefined for a missing gift", async () => {
    const saved = await repo.insert(gift);
    const changed = { dateGiven: "2026-03-02", forMonth: "2026-02", cents: 99, method: "card" as const };
    expect(await repo.update(saved.id, changed)).toEqual({ id: saved.id, ...changed });
    expect(await repo.update(saved.id + 1000, changed)).toBeUndefined();
  });

  it("[AC-GIV-01.4] delete removes the row for good", async () => {
    const saved = await repo.insert(gift);
    expect(await repo.remove(saved.id)).toBe(true);
    expect(await repo.remove(saved.id)).toBe(false);
    expect(await repo.listAll()).toEqual([]);
  });

  it("[AC-GIV-01.1] the database itself refuses a zero amount and an unknown payment method", async () => {
    await expect(repo.insert({ ...gift, cents: 0 })).rejects.toThrow();
    await expect(repo.insert({ ...gift, method: "cash" as never })).rejects.toThrow();
  });

  describe("special contributions", () => {
    const special = { dateGiven: "2026-03-29", occasion: "Spring offering", cents: 10_050, method: "card" as const };
    beforeEach(clearGifts);

    it("[AC-GIV-02.1] stores date given, occasion, cents and method, and returns the date as plain text", async () => {
      const saved = await repo.insertSpecial(special);
      expect(saved).toEqual({ id: expect.any(Number), ...special });
      expect(await repo.listSpecial()).toEqual([saved]);
    });

    it("[AC-GIV-02.2] keeps them apart from regular gifts and lists newest date first", async () => {
      await repo.insert(gift);
      await repo.insertSpecial({ ...special, dateGiven: "2026-01-05" });
      await repo.insertSpecial({ ...special, dateGiven: "2026-09-14", occasion: "Building fund appeal" });
      expect((await repo.listSpecial()).map((c) => c.dateGiven)).toEqual(["2026-09-14", "2026-01-05"]);
      expect(await repo.listAll()).toHaveLength(1);
    });

    it("[AC-GIV-02.1] refuses a blank occasion at the database", async () => {
      await expect(repo.insertSpecial({ ...special, occasion: "   " })).rejects.toThrow();
    });

    it("[AC-GIV-02.1] edit changes every field and delete removes the row; both report a missing row", async () => {
      const saved = await repo.insertSpecial(special);
      const changed = { dateGiven: "2026-04-05", occasion: "Easter offering", cents: 99, method: "check" as const };
      expect(await repo.updateSpecial(saved.id, changed)).toEqual({ id: saved.id, ...changed });
      expect(await repo.updateSpecial(saved.id + 1000, changed)).toBeUndefined();
      expect(await repo.removeSpecial(saved.id)).toBe(true);
      expect(await repo.removeSpecial(saved.id)).toBe(false);
    });
  });
});
