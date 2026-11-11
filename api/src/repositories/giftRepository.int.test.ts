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
});
