import { describe, expect, it } from "vitest";
import { currentUserId, withRequestUser } from "./requestUser.js";

describe("the person a request is for (SET-04)", () => {
  it("[AC-SET-04.2] is the person set for this request, also after an await", async () => {
    const seen = await withRequestUser(7, async () => {
      await Promise.resolve();
      return currentUserId();
    });
    expect(seen).toBe(7);
  });

  it("[AC-SET-04.2] keeps two requests at the same time apart", async () => {
    const [a, b] = await Promise.all([
      withRequestUser(1, async () => { await new Promise((r) => setTimeout(r, 10)); return currentUserId(); }),
      withRequestUser(2, async () => currentUserId()),
    ]);
    expect([a, b]).toEqual([1, 2]);
  });

  it("[AC-SET-04.2] fails closed: with no person set it throws instead of returning something", () => {
    expect(() => currentUserId()).toThrow(/No person/);
    expect(() => currentUserId()).toThrowError(expect.objectContaining({ code: "NO_PERSON" }));
  });
});
