import { describe, expect, it } from "vitest";
import { availabilityResponseSchema, DEPENDENCY_PARTS, unavailableBanner, unavailableParts, unavailableResponseSchema, unavailableSentence } from "./availability.js";

describe("availability", () => {
  it("[AC-OPS-14.1][AC-OPS-14.2] an unavailable answer names one known part and nothing else", () => {
    expect([...DEPENDENCY_PARTS]).toEqual(["database", "documents", "signIn"]);
    for (const part of DEPENDENCY_PARTS) expect(unavailableResponseSchema.safeParse({ error: "unavailable", part }).success).toBe(true);
    for (const bad of [{ error: "unavailable" }, { error: "unavailable", part: "cache" }, { error: "internal", part: "database" }, { error: "unavailable", part: "database", message: "ECONNREFUSED 10.0.0.1" }]) {
      expect(unavailableResponseSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("[AC-OPS-14.3] lists the parts that are down, in a fixed order", () => {
    expect(unavailableParts({ database: "ok", documents: "ok", signIn: "ok" })).toEqual([]);
    expect(unavailableParts({ database: "unavailable", documents: "ok", signIn: "unavailable" })).toEqual(["database", "signIn"]);
    expect(availabilityResponseSchema.safeParse({ database: "ok", documents: "ok", signIn: "ok", host: "x" }).success).toBe(false);
  });

  it("[AC-OPS-14.3][AC-OPS-14.5] the banner is plain words, says the saved data is safe, and has nothing technical in it", () => {
    expect(unavailableBanner([])).toBe("");
    expect(unavailableBanner(["database"])).toBe("The database is not available right now. Please try again in a few minutes. Your saved data is safe.");
    expect(unavailableBanner(["signIn", "documents"])).toBe("Documents are not available right now. The sign-in check is not available right now. Please try again in a few minutes. Your saved data is safe.");
    for (const part of DEPENDENCY_PARTS) expect(unavailableSentence(part)).not.toMatch(/R2|Postgres|Neon|Cloudflare|JWKS|error|ECONN|\d/i);
  });
});
