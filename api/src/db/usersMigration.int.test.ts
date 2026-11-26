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

// "before-users" stops before the users migration, "users" stops right after it (the state of the part 1 and part 2 releases), and
// "all" applies everything, including the later migration that makes user_id required (requirePersonMigration.int.test.ts).
async function migrate(through: "before-users" | "users" | "all") {
  const { admin } = await createFreshDatabase(server!);
  const files = await readMigrationFiles(migrationsDir);
  const upToUsers = files.filter((file) => file.name <= USERS_MIGRATION);
  await applyMigrations(admin, through === "all" ? files : through === "users" ? upToUsers : files.filter((file) => file.name < USERS_MIGRATION));
  return { admin, files: upToUsers };
}

describe.skipIf(!server)("people and per-person columns (SET-04)", () => {
  it("[AC-SET-04.3] rows saved before the migration survive it untouched, and the live code's inserts still work after it", async () => {
    const { admin, files } = await migrate("before-users");
    await run(admin, "INSERT INTO odometer_readings (reading_date, miles) VALUES ('2026-01-01', 1000)");
    await run(admin, "INSERT INTO weight_entries (entry_date, pounds) VALUES ('2026-01-01', 180.5)");
    await run(admin, "INSERT INTO service_places (name) VALUES ('Sample Garage')");
    await run(admin, "INSERT INTO maintenance_records (service_date, done_by, place_id, services) SELECT '2026-01-02', 'shop', id, ARRAY['Oil change'] FROM service_places");

    expect(await applyMigrations(admin, files)).toEqual([USERS_MIGRATION]);

    expect(await run(admin, "SELECT miles FROM odometer_readings")).toEqual([{ miles: 1000 }]);
    expect(await run(admin, "SELECT count(*)::int AS n FROM maintenance_records")).toEqual([{ n: 1 }]);
    expect((await run<{ user_id: string | null }>(admin, "SELECT user_id FROM odometer_readings"))[0]?.user_id).toBeNull();

    // The code that is live during a Release does not know about user_id. These are its statements, unchanged.
    await run(admin, "INSERT INTO odometer_readings (reading_date, miles) VALUES ('2026-01-08', 1100)");
    await run(admin, "INSERT INTO weight_entries (entry_date, pounds) VALUES ('2026-01-08', 179.0) ON CONFLICT (entry_date) DO UPDATE SET pounds = EXCLUDED.pounds");
    await run(admin, "INSERT INTO workouts (workout_date, workout_type, minutes) VALUES ('2026-01-08', 'Walk', 30)");
    await run(admin, "INSERT INTO regular_gifts (given_on, for_month, amount, method) VALUES ('2026-01-08', '2026-01-01', 10, 'check')");
    await run(admin, "INSERT INTO special_contributions (given_on, occasion, amount, method) VALUES ('2026-01-08', 'Sample appeal', 5, 'card')");
    expect(await run(admin, "SELECT count(*)::int AS n FROM odometer_readings")).toEqual([{ n: 2 }]);
  });

  it("[AC-SET-04.9] a person has a lower-case unique email, a role and a status", async () => {
    const { admin } = await migrate("users");
    await run(admin, "INSERT INTO users (email, role) VALUES ('owner@example.test', 'admin')");
    const row = (await run<{ role: string; status: string; last_login_at: string | null }>(admin, "SELECT role, status, last_login_at FROM users"))[0];
    expect(row).toEqual({ role: "admin", status: "active", last_login_at: null });

    await expect(run(admin, "INSERT INTO users (email) VALUES ('owner@example.test')")).rejects.toThrow(/users_email_idx/);
    await expect(run(admin, "INSERT INTO users (email) VALUES ('Mixed.Case@Example.test')")).rejects.toThrow(/check/);
    await expect(run(admin, "INSERT INTO users (email) VALUES (' spaced@example.test ')")).rejects.toThrow(/check/);
    await expect(run(admin, "INSERT INTO users (email, role) VALUES ('a@example.test', 'owner')")).rejects.toThrow(/check/);
    await expect(run(admin, "INSERT INTO users (email, status) VALUES ('b@example.test', 'gone')")).rejects.toThrow(/check/);
  });

  it("[AC-SET-04.3][AC-SET-04.9] after the users migration every table that holds a person's data has a nullable user_id that points at a person, and nothing else is unlisted", async () => {
    const { admin } = await migrate("users");
    const columns = await run<{ table_name: string; is_nullable: string }>(
      admin,
      "SELECT table_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'user_id'",
    );
    expect(columns.map((c) => c.table_name).sort()).toEqual([...SET_04_TABLES].sort());
    expect(columns.every((c) => c.is_nullable === "YES")).toBe(true);

    // A table added later must be listed in personTables.ts (or be `users`), so deleting a person cannot miss it.
    const tables = await run<{ table_name: string }>(admin, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
    expect(tables.map((t) => t.table_name).sort()).toEqual([...SET_04_TABLES, "users"].sort());

    await expect(run(admin, "INSERT INTO odometer_readings (reading_date, miles, user_id) VALUES ('2026-01-01', 1, 999999)")).rejects.toThrow(/foreign key/);
  });

  it("[AC-SET-04.9][AC-GRO-01.6] with every migration applied, every table that holds a person's data is listed in personTables.ts, so deleting a person removes the grocery list too", async () => {
    const { admin } = await migrate("all");
    const tables = await run<{ table_name: string }>(admin, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
    expect(tables.map((t) => t.table_name).sort()).toEqual([...PERSON_TABLES, "users"].sort());
    const columns = await run<{ table_name: string; is_nullable: string }>(admin, "SELECT table_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'user_id'");
    expect(columns.map((c) => c.table_name).sort()).toEqual([...PERSON_TABLES].sort());
    expect(columns.every((c) => c.is_nullable === "NO")).toBe(true);
  });

  it("[AC-SET-04.10] two people can each have a weight on the same day and a place with the same name, but one person cannot repeat either", async () => {
    const { admin } = await migrate("all");
    await run(admin, "INSERT INTO users (email) VALUES ('a@example.test'), ('b@example.test')");
    const ids = (await run<{ id: string }>(admin, "SELECT id::text FROM users ORDER BY email")).map((u) => u.id);
    const [a, b] = ids as [string, string];

    // The later migration has removed the old single-person rules, so only the per-person ones apply.
    await run(admin, `INSERT INTO weight_entries (entry_date, pounds, user_id) VALUES ('2026-01-01', 180, ${a}), ('2026-01-01', 150, ${b})`);
    await expect(run(admin, `INSERT INTO weight_entries (entry_date, pounds, user_id) VALUES ('2026-01-01', 181, ${a})`)).rejects.toThrow(/weight_entries_user_date_idx/);

    await run(admin, `INSERT INTO service_places (name, user_id) VALUES ('Sample Garage', ${a}), ('Sample Garage', ${b})`);
    await expect(run(admin, `INSERT INTO service_places (name, user_id) VALUES ('SAMPLE garage', ${a})`)).rejects.toThrow(/service_places_user_name_idx/);
  });
});
