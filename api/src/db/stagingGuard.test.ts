import { describe, expect, it } from "vitest";
import { SeedRefusal, STAGING_DATABASE, assertStagingDatabase } from "./stagingGuard.js";

describe("seed guard (OPS-08)", () => {
  it("[AC-OPS-08.2] accepts the database named lt_staging", () => {
    expect(STAGING_DATABASE).toBe("lt_staging");
    expect(() => assertStagingDatabase("postgresql://admin:pw@ep-example-123.us-west-2.aws.neon.tech/lt_staging?sslmode=verify-full")).not.toThrow();
    expect(() => assertStagingDatabase("postgresql://admin:pw@localhost:5432/lt_staging")).not.toThrow();
  });

  it.each([
    ["the default Neon name", "postgresql://admin:pw@ep-example-123.us-west-2.aws.neon.tech/neondb?sslmode=verify-full"],
    ["a production-style name", "postgresql://admin:pw@ep-example-123.us-west-2.aws.neon.tech/lt_production"],
    ["a name that only starts the same", "postgresql://admin:pw@host/lt_staging_copy"],
    ["a name that only ends the same", "postgresql://admin:pw@host/old_lt_staging"],
    ["a different letter case", "postgresql://admin:pw@host/LT_STAGING"],
    ["no database name", "postgresql://admin:pw@host"],
    ["an empty database name", "postgresql://admin:pw@host/"],
    ["staging only as the user name", "postgresql://lt_staging:pw@host/neondb"],
    ["staging only in the query", "postgresql://admin:pw@host/neondb?options=lt_staging"],
  ])("[AC-OPS-08.2] refuses %s", (_label, address) => {
    expect(() => assertStagingDatabase(address)).toThrow(SeedRefusal);
  });

  it("[AC-OPS-08.2] refuses something that is not an address at all", () => {
    expect(() => assertStagingDatabase("not a url")).toThrow(SeedRefusal);
    expect(() => assertStagingDatabase("")).toThrow(SeedRefusal);
  });

  it("[AC-OPS-08.2] a refusal never repeats the address, the password or the user", () => {
    for (const address of ["postgresql://secretuser:secretpw@secrethost.example/otherdb", "secretpw-not-a-url"]) {
      try {
        assertStagingDatabase(address);
        expect.unreachable();
      } catch (error) {
        const message = (error as Error).message;
        expect(message).not.toMatch(/secretuser|secretpw|secrethost|otherdb/);
      }
    }
  });
});
