import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { connectFreshAppDatabase, disconnectAppDatabase } from "./repositories/odometerTestDatabase.js";
import { testQuery as q } from "./repositories/personTestDatabase.js";
import { peopleService } from "./services/peopleService.js";

const server = inject("postgres");

describe.skipIf(!server)("the owner's person row (real Postgres)", () => {
  beforeAll(() => connectFreshAppDatabase(server!));
  afterAll(disconnectAppDatabase);

  it("[AC-SET-04.9] the first time the owner is seen they become an admin, with the email stored lower-case and trimmed", async () => {
    const owner = await peopleService.ensureOwner("  Owner@Example.test ");
    expect(owner).toEqual({ id: expect.any(Number), role: "admin", status: "active" });
    expect((await q("SELECT email FROM users")).rows).toEqual([{ email: "owner@example.test" }]);
  });

  it("[AC-SET-04.9] seeing the owner again changes nothing, even many requests at the same moment", async () => {
    const first = await peopleService.ensureOwner("owner@example.test");
    const many = await Promise.all(Array.from({ length: 8 }, () => peopleService.ensureOwner("OWNER@example.test")));
    expect(many.every((person) => person.id === first.id)).toBe(true);
    expect((await q("SELECT count(*)::int AS n FROM users")).rows[0].n).toBe(1);
  });

  it("[AC-SET-04.9] two requests at the same moment for a brand-new owner make one row, not two", async () => {
    const people = await Promise.all(Array.from({ length: 6 }, () => peopleService.ensureOwner("second-owner@example.test")));
    expect(new Set(people.map((p) => p.id)).size).toBe(1);
    expect((await q("SELECT count(*)::int AS n FROM users WHERE email = 'second-owner@example.test'")).rows[0].n).toBe(1);
  });

  it("[AC-SET-04.9] a person who has been removed is reported as removed, so the app can refuse them", async () => {
    await q("UPDATE users SET status = 'removed' WHERE email = 'second-owner@example.test'");
    expect((await peopleService.ensureOwner("second-owner@example.test")).status).toBe("removed");
  });

  it("[AC-SET-04.2] a query with no person set fails instead of running unfiltered", async () => {
    const { odometerRepository } = await import("./repositories/odometerRepository.js");
    await expect(odometerRepository.listAll()).rejects.toThrow(/No person/);
  });
});
