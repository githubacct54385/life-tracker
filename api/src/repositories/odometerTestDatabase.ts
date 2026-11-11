// Test support only (used by *.int.test.ts, never by production code): a throwaway Postgres built from the REAL
// migrations, connected as the least-privilege app role. It lives in repositories/ because only that layer may use db/.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool, useConnection } from "../db/connection.js";
import { applyMigrations, readMigrationFiles } from "../db/migrationRunner.js";
import { createAppRole, createFreshDatabase, type PostgresInfo } from "../db/testDatabase.js";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../db/migrations");

export async function connectFreshAppDatabase(server: PostgresInfo): Promise<void> {
  const { admin, name } = await createFreshDatabase(server);
  await applyMigrations(admin, await readMigrationFiles(migrationsDir));
  await useConnection(await createAppRole(server, name));
}

export async function disconnectAppDatabase(): Promise<void> {
  await closePool();
  await useConnection(undefined);
}

export async function clearOdometerReadings(): Promise<void> {
  await getPool().query("DELETE FROM odometer_readings");
}

export async function seedOdometerReading(date: string, miles: number): Promise<void> {
  await getPool().query("INSERT INTO odometer_readings (reading_date, miles) VALUES ($1::date, $2)", [date, miles]);
}
