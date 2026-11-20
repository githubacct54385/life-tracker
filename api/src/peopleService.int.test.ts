import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { connectFreshAppDatabase, disconnectAppDatabase } from "./repositories/odometerTestDatabase.js";
import { PERSON_TABLES, testQuery as q } from "./repositories/personTestDatabase.js";
import { peopleService } from "./services/peopleService.js";

const server = inject("postgres");

describe.skipIf(!server)("the owner's person row (real Postgres)", () => {
  beforeAll(() => connectFreshAppDatabase(server!));
  afterAll(disconnectAppDatabase);

  it("[AC-SET-04.3][AC-SET-04.9] the first time the owner is seen they become an admin, and everything saved before people existed becomes theirs", async () => {
    // Rows as the code before this change left them: no person.
    await q("INSERT INTO odometer_readings (reading_date, miles) VALUES ('2026-01-01', 1000)");
    await q("INSERT INTO weight_entries (entry_date, pounds) VALUES ('2026-01-01', 180)");
    await q("INSERT INTO workouts (workout_date, workout_type, minutes) VALUES ('2026-01-01', 'Walk', 30)");
    await q("INSERT INTO regular_gifts (given_on, for_month, amount, method) VALUES ('2026-01-05', '2026-01-01', 10, 'check')");
    await q("INSERT INTO special_contributions (given_on, occasion, amount, method) VALUES ('2026-01-05', 'Sample appeal', 5, 'card')");
    await q("INSERT INTO service_places (name) VALUES ('Sample Garage')");
    await q("INSERT INTO maintenance_records (service_date, done_by, place_id, services) SELECT '2026-01-02', 'shop', id, ARRAY['Oil change'] FROM service_places");
    await q("INSERT INTO maintenance_documents (record_id, object_key, content_type, bytes) SELECT id, 'sample-object-key-0001', 'application/pdf', 10 FROM maintenance_records");

    const owner = await peopleService.ensureOwner("  Owner@Example.test ");
    expect(owner).toEqual({ id: expect.any(Number), role: "admin", status: "active" });
    expect((await q("SELECT email FROM users")).rows).toEqual([{ email: "owner@example.test" }]);
    for (const table of PERSON_TABLES) {
      const unowned = await q(`SELECT count(*)::int AS n FROM ${table} WHERE user_id IS DISTINCT FROM $1`, [owner.id]);
      expect(unowned.rows[0].n, table).toBe(0);
    }
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
