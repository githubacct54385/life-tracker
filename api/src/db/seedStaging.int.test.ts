import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, inject, it } from "vitest";
import { applyMigrations, readMigrationFiles } from "./migrationRunner.js";
import { SeedRefusal } from "./stagingGuard.js";
import { seedStaging } from "./seedStaging.js";
import { buildStagingSeed } from "./stagingSeed.js";
import { createFreshDatabase, run } from "./testDatabase.js";

// Skipped only when Docker is missing on a laptop (see globalSetup.int.ts). CI always runs them.
const server = inject("postgres");
const migrations = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../db/migrations");
const TODAY = "2026-11-20";

async function migrated() {
  const { admin } = await createFreshDatabase(server!);
  await applyMigrations(admin, await readMigrationFiles(migrations));
  return admin;
}
/** A migrated database with the staging admin, who is made the first time the owner opens the staging site. */
async function migratedWithAdmin() {
  const admin = await migrated();
  await run(admin, "INSERT INTO users (email, role) VALUES ('staging-admin@example.test', 'admin')");
  return admin;
}
const count = async (admin: Awaited<ReturnType<typeof migrated>>, table: string) => Number((await run<{ n: string }>(admin, `SELECT count(*)::text AS n FROM ${table}`))[0]!.n);

describe.skipIf(!server)("staging sample data against the real tables", () => {
  it("[AC-OPS-08.2] fills an empty database in full, and every row passes the table's own checks", async () => {
    const admin = await migratedWithAdmin();
    const seed = buildStagingSeed(TODAY);
    const counts = await seedStaging(admin, seed, { reset: false });
    expect(counts).toEqual({ odometer: 40, weights: seed.weights.length, workouts: 36, gifts: seed.gifts.length, specials: 2, places: 2, maintenance: 6 });
    expect(await count(admin, "odometer_readings")).toBe(40);
    expect(await count(admin, "weight_entries")).toBe(seed.weights.length);
    expect(await count(admin, "workouts")).toBe(36);
    expect(await count(admin, "regular_gifts")).toBe(seed.gifts.length);
    expect(await count(admin, "special_contributions")).toBe(2);
    expect(await count(admin, "service_places")).toBe(2);
    expect(await count(admin, "maintenance_records")).toBe(6);
    expect(await count(admin, "maintenance_documents")).toBe(0);
  });

  it("[AC-OPS-08.2] links each shop service to its place, and a service done at home has none", async () => {
    const admin = await migratedWithAdmin();
    await seedStaging(admin, buildStagingSeed(TODAY), { reset: false });
    const rows = await run<{ done_by: string; place: string | null; services: string[] }>(
      admin,
      "SELECT r.done_by, p.name AS place, r.services FROM maintenance_records r LEFT JOIN service_places p ON p.id = r.place_id ORDER BY r.service_date DESC",
    );
    expect(rows.filter((row) => row.done_by === "home").every((row) => row.place === null)).toBe(true);
    expect(rows.filter((row) => row.done_by === "shop").every((row) => row.place !== null)).toBe(true);
    // Newest first: the most recent service is an oil change, the oldest a brake job.
    expect(rows[0]?.services).toEqual(["Oil change"]);
    expect(rows.at(-1)?.services).toEqual(["Brakes"]);
  });

  it("[AC-OPS-08.2][AC-SET-04.3] gives all the sample data to the admin", async () => {
    const admin = await migratedWithAdmin();
    await seedStaging(admin, buildStagingSeed(TODAY), { reset: false });
    const owned = await run<{ n: string }>(admin, "SELECT count(*)::text AS n FROM odometer_readings o JOIN users u ON u.id = o.user_id WHERE u.email = 'staging-admin@example.test'");
    expect(owned[0]?.n).toBe("40");
    for (const table of ["maintenance_records", "service_places", "workouts", "weight_entries", "regular_gifts", "special_contributions"]) {
      expect(await run(admin, `SELECT 1 FROM ${table} WHERE user_id IS NULL`), table).toEqual([]);
    }
  });

  it("[AC-OPS-08.2][AC-SET-04.3] with no admin yet it stops with a clear message and changes nothing, even with a reset", async () => {
    const admin = await migrated();
    await expect(seedStaging(admin, buildStagingSeed(TODAY), { reset: false })).rejects.toThrow(/Open the staging site once/);
    expect(await count(admin, "odometer_readings")).toBe(0);

    await run(admin, "INSERT INTO users (email, role) VALUES ('staging-admin@example.test', 'admin')");
    await seedStaging(admin, buildStagingSeed(TODAY), { reset: false });
    await run(admin, "UPDATE users SET role = 'user'");
    await expect(seedStaging(admin, buildStagingSeed(TODAY), { reset: true })).rejects.toThrow(SeedRefusal);
    expect(await count(admin, "odometer_readings")).toBe(40);
  });

  it("[AC-OPS-08.6] refuses a database that already has data, and changes nothing", async () => {
    const admin = await migratedWithAdmin();
    await seedStaging(admin, buildStagingSeed(TODAY), { reset: false });
    await expect(seedStaging(admin, buildStagingSeed(TODAY), { reset: false })).rejects.toThrow(SeedRefusal);
    expect(await count(admin, "odometer_readings")).toBe(40);
    expect(await count(admin, "workouts")).toBe(36);
  });

  it("[AC-OPS-08.6] a reset empties everything first and gives back the same sample data with ids starting again from 1", async () => {
    const admin = await migratedWithAdmin();
    await seedStaging(admin, buildStagingSeed(TODAY), { reset: false });
    await run(admin, "INSERT INTO odometer_readings (reading_date, miles, user_id) SELECT d, m, (SELECT id FROM users LIMIT 1) FROM (VALUES ('2026-01-01'::date, 1), ('2026-01-02'::date, 2)) AS t(d, m)");
    await run(admin, "INSERT INTO maintenance_documents (record_id, object_key, content_type, bytes, user_id) SELECT id, 'sample-object-key-0001', 'application/pdf', 10, user_id FROM maintenance_records LIMIT 1");
    expect(await count(admin, "odometer_readings")).toBe(42);

    await seedStaging(admin, buildStagingSeed(TODAY), { reset: true });
    expect(await count(admin, "odometer_readings")).toBe(40);
    expect(await count(admin, "maintenance_documents")).toBe(0);
    expect((await run<{ id: string }>(admin, "SELECT min(id)::text AS id FROM odometer_readings"))[0]?.id).toBe("1");
  });

  it("[AC-OPS-08.6] a failure part-way leaves the database exactly as it was (one transaction)", async () => {
    const admin = await migratedWithAdmin();
    const broken = buildStagingSeed(TODAY);
    // A reading past the table's limit fails the first insert only after the reset has run, which must be undone too.
    await seedStaging(admin, buildStagingSeed(TODAY), { reset: false });
    broken.maintenance[0]!.odometerMiles = 99_999_999;
    await expect(seedStaging(admin, broken, { reset: true })).rejects.toThrow();
    expect(await count(admin, "odometer_readings")).toBe(40);
    expect(await count(admin, "maintenance_records")).toBe(6);
  });
});
