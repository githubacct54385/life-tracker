import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, inject, it } from "vitest";
import { applyMigrations, readMigrationFiles } from "./migrationRunner.js";
import { PERSON_TABLES } from "./personTables.js";
import { createFreshDatabase, run } from "./testDatabase.js";

// Skipped only when Docker is missing on a laptop (see globalSetup.int.ts). CI always runs them.
const server = inject("postgres");
const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../db/migrations");
// The tables SET-04 covers. Later stories add tables (grocery_items, GRO-01; workout_goals, HLT-05) that these migration tests stop before.
const SET_04_TABLES = PERSON_TABLES.filter((table) => table !== "grocery_items" && table !== "workout_goals");

const USERS_MIGRATION = "0011_create_users_and_add_user_id.sql";
const REQUIRE_MIGRATION = "0012_require_user_id_and_drop_old_unique_rules.sql";

/** A database in the state of the part 2 release: users exist, user_id is nullable, the code writes it. */
async function atPartTwo() {
  const { admin } = await createFreshDatabase(server!);
  const files = await readMigrationFiles(migrationsDir);
  await applyMigrations(admin, files.filter((file) => file.name <= USERS_MIGRATION));
  return { admin, files: files.filter((file) => file.name <= REQUIRE_MIGRATION) };
}

const notNull = async (admin: Awaited<ReturnType<typeof atPartTwo>>["admin"]) =>
  (await run<{ table_name: string; is_nullable: string }>(admin, "SELECT table_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'user_id'")).every(
    (c) => c.is_nullable === "NO",
  );

describe.skipIf(!server)("every row belongs to a person (SET-04 part 3)", () => {
  it("[AC-SET-04.3] gives rows that still have no person to the admin, keeps all the data, and makes user_id required on every person table", async () => {
    const { admin, files } = await atPartTwo();
    await run(admin, "INSERT INTO users (email, role) VALUES ('owner@example.test', 'admin'), ('other@example.test', 'user')");
    const [owner, other] = (await run<{ id: string }>(admin, "SELECT id::text FROM users ORDER BY id")).map((u) => u.id) as [string, string];
    // Rows an older instance wrote with no person, plus a row that already belongs to someone else.
    await run(admin, "INSERT INTO odometer_readings (reading_date, miles) VALUES ('2026-01-01', 1000), ('2026-01-08', 1100)");
    await run(admin, "INSERT INTO weight_entries (entry_date, pounds) VALUES ('2026-01-01', 180.5)");
    await run(admin, "INSERT INTO service_places (name) VALUES ('Sample Garage')");
    await run(admin, "INSERT INTO maintenance_records (service_date, done_by, place_id, services) SELECT '2026-01-02', 'shop', id, ARRAY['Oil change'] FROM service_places");
    await run(admin, "INSERT INTO workouts (workout_date, workout_type, minutes) VALUES ('2026-01-03', 'Walk', 30)");
    await run(admin, `INSERT INTO weight_entries (entry_date, pounds, user_id) VALUES ('2026-01-02', 150, ${other})`);

    expect(await applyMigrations(admin, files)).toEqual([REQUIRE_MIGRATION]);

    expect(await run(admin, "SELECT count(*)::int AS n FROM odometer_readings")).toEqual([{ n: 2 }]);
    expect(await run(admin, `SELECT count(*)::int AS n FROM odometer_readings WHERE user_id = ${owner}`)).toEqual([{ n: 2 }]);
    expect(await run(admin, `SELECT user_id::text FROM weight_entries ORDER BY entry_date`)).toEqual([{ user_id: owner }, { user_id: other }]);
    expect(await run(admin, `SELECT count(*)::int AS n FROM maintenance_records WHERE user_id = ${owner}`)).toEqual([{ n: 1 }]);
    expect(await notNull(admin)).toBe(true);
    const columns = await run<{ table_name: string }>(admin, "SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'user_id' AND is_nullable = 'NO'");
    expect(columns.map((c) => c.table_name).sort()).toEqual([...SET_04_TABLES].sort());
  });

  it("[AC-SET-04.3] stops with a clear message, and changes nothing, when rows have no person and there is no admin to give them to", async () => {
    const { admin } = await atPartTwo();
    await run(admin, "INSERT INTO odometer_readings (reading_date, miles) VALUES ('2026-01-01', 1000)");
    const all = (await readMigrationFiles(migrationsDir)).filter((file) => file.name <= REQUIRE_MIGRATION);

    // The migrate command prints the cause's message, so that is where the owner reads the reason in the Release log.
    const failure = await applyMigrations(admin, all).then(() => undefined, (error: unknown) => error as Error);
    expect(failure?.message).toMatch(/failed and was rolled back/);
    expect((failure?.cause as Error | undefined)?.message).toMatch(/Open the app once as the owner/);

    expect(await run(admin, "SELECT count(*)::int AS n FROM odometer_readings")).toEqual([{ n: 1 }]);
    expect(await notNull(admin)).toBe(false); // the whole file rolled back
    expect(await run(admin, "SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'weight_entries_entry_date_key'")).toEqual([{ n: 1 }]);
    expect(await run(admin, "SELECT name FROM migrations.schema_migrations WHERE name = '0012_require_user_id_and_drop_old_unique_rules.sql'")).toEqual([]);

    // Once the owner has signed in (their row exists), the same release goes through.
    await run(admin, "INSERT INTO users (email, role) VALUES ('owner@example.test', 'admin')");
    expect(await applyMigrations(admin, all)).toEqual([REQUIRE_MIGRATION]);
  });

  it("[AC-SET-04.3] runs on an empty database with no people at all, as a new environment or a test database does", async () => {
    const { admin } = await createFreshDatabase(server!);
    const all = await readMigrationFiles(migrationsDir);
    expect(await applyMigrations(admin, all)).toContain(REQUIRE_MIGRATION);
    expect(await notNull(admin)).toBe(true);
  });

  it("[AC-SET-04.10] two people can each have a weight on the same day and a place with the same name, one person cannot repeat either, and a row with no person is refused", async () => {
    const { admin } = await atPartTwo();
    await run(admin, "INSERT INTO users (email, role) VALUES ('a@example.test', 'admin'), ('b@example.test', 'user')");
    await applyMigrations(admin, await readMigrationFiles(migrationsDir));
    const [a, b] = (await run<{ id: string }>(admin, "SELECT id::text FROM users ORDER BY id")).map((u) => u.id) as [string, string];

    expect(await run(admin, "SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'weight_entries_entry_date_key'")).toEqual([{ n: 0 }]);
    expect(await run(admin, "SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'service_places_name_idx'")).toEqual([{ n: 0 }]);

    await run(admin, `INSERT INTO weight_entries (entry_date, pounds, user_id) VALUES ('2026-01-01', 180, ${a}), ('2026-01-01', 150, ${b})`);
    await expect(run(admin, `INSERT INTO weight_entries (entry_date, pounds, user_id) VALUES ('2026-01-01', 181, ${a})`)).rejects.toThrow(/weight_entries_user_date_idx/);
    await run(admin, `INSERT INTO service_places (name, user_id) VALUES ('Sample Garage', ${a}), ('Sample Garage', ${b})`);
    await expect(run(admin, `INSERT INTO service_places (name, user_id) VALUES ('SAMPLE garage', ${a})`)).rejects.toThrow(/service_places_user_name_idx/);

    await expect(run(admin, "INSERT INTO odometer_readings (reading_date, miles) VALUES ('2026-01-01', 1)")).rejects.toThrow(/null value/);
  });
});
