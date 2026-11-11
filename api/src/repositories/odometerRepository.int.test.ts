import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { applyMigrations, readMigrationFiles } from "../db/migrationRunner.js";
import { closePool, getPool, useConnection } from "../db/connection.js";
import { createAppRole, createFreshDatabase } from "../db/testDatabase.js";
import { odometerRepository as repo } from "./odometerRepository.js";

const server = inject("postgres");
const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../db/migrations");

describe.skipIf(!server)("odometerRepository (real Postgres, real migration, app role)", () => {
  beforeAll(async () => {
    const { admin, name } = await createFreshDatabase(server!);
    await applyMigrations(admin, await readMigrationFiles(migrationsDir));
    await useConnection(await createAppRole(server!, name));
  });
  afterAll(async () => {
    await closePool();
    await useConnection(undefined);
  });
  beforeEach(async () => {
    await getPool().query("DELETE FROM odometer_readings");
  });

  it("[AC-MIL-01.1] stores the reading with the calendar date it was given and returns it as plain text", async () => {
    const saved = await repo.insert({ date: "2026-11-13", miles: 48_402 });
    expect(saved).toEqual({ id: expect.any(Number), date: "2026-11-13", miles: 48_402 });
    expect(await repo.listAll()).toEqual([saved]);
  });

  it("[AC-MIL-01.4] lists the newest first, and allows two readings on one date", async () => {
    await repo.insert({ date: "2026-11-06", miles: 100 });
    await repo.insert({ date: "2026-11-13", miles: 200 });
    await repo.insert({ date: "2026-11-13", miles: 250 });
    expect((await repo.listAll()).map((r) => [r.date, r.miles])).toEqual([
      ["2026-11-13", 250],
      ["2026-11-13", 200],
      ["2026-11-06", 100],
    ]);
  });

  it("[AC-MIL-01.4] editing changes the miles and keeps the original date", async () => {
    const saved = await repo.insert({ date: "2026-10-30", miles: 100 });
    expect(await repo.updateMiles(saved.id, 150)).toEqual({ id: saved.id, date: "2026-10-30", miles: 150 });
    expect(await repo.updateMiles(saved.id + 1000, 1)).toBeUndefined();
  });

  it("[AC-MIL-01.4] deleting removes the row for good", async () => {
    const saved = await repo.insert({ date: "2026-10-30", miles: 100 });
    expect(await repo.remove(saved.id)).toBe(true);
    expect(await repo.remove(saved.id)).toBe(false);
    expect(await repo.listAll()).toEqual([]);
  });

  it("[AC-MIL-01.4] the database itself refuses a negative reading", async () => {
    await expect(repo.insert({ date: "2026-10-30", miles: -1 })).rejects.toThrow();
  });
});
