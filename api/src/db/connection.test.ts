import { describe, expect, it } from "vitest";
import { getPool, withRequestPool } from "./connection";

describe("withRequestPool", () => {
  it("[AC-MIL-01.1] gives each request its own pool from the Worker's DATABASE_URL and closes it afterwards", async () => {
    const closing: Promise<unknown>[] = [];
    const seen: unknown[] = [];
    const url = "postgres://user:secret@db.example.test:5432/app"; // synthetic, never connected to
    for (let i = 0; i < 2; i++) {
      await withRequestPool(url, async () => void seen.push(getPool()), (done) => closing.push(done));
    }
    expect(seen[0]).not.toBe(seen[1]);
    expect(closing).toHaveLength(2);
    await Promise.all(closing);
  });

  it("[AC-MIL-01.1] fails closed when the secret is missing: no pool, so a query throws instead of guessing", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await withRequestPool(undefined, async () => expect(() => getPool()).toThrow("DATABASE_URL is not set"));
      await withRequestPool("   ", async () => expect(() => getPool()).toThrow("DATABASE_URL is not set"));
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });
});
