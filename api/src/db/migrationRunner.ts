import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { checksum, planMigrations, type AppliedMigration, type MigrationFile } from "./migrationPlan.js";

// The journal lives in its own schema so the app role (which only gets the public schema) cannot see or change it.
const JOURNAL = "migrations.schema_migrations";

const CREATE_JOURNAL = `
CREATE SCHEMA IF NOT EXISTS migrations;
CREATE TABLE IF NOT EXISTS ${JOURNAL} (
  name text PRIMARY KEY,
  checksum char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

// Two releases must not migrate at once. Any constant works; it only has to be the same everywhere.
const LOCK_KEY = 727_274;

export async function readMigrationFiles(dir: string): Promise<MigrationFile[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith(".sql"));
  return Promise.all(names.map(async (name) => ({ name, sql: await readFile(path.join(dir, name), "utf8") })));
}

/**
 * Apply pending migrations with the ADMIN connection. Never call this from the app (hard rule 10).
 * Each file runs in one transaction (Postgres can roll back schema changes), so a failure leaves nothing behind.
 * That also means a file cannot use statements Postgres refuses inside a transaction, such as CREATE INDEX CONCURRENTLY.
 * Returns the names applied in this run (empty when up to date).
 */
export async function applyMigrations(
  connection: string | pg.ClientConfig,
  files: MigrationFile[],
  log: (message: string) => void = () => {},
): Promise<string[]> {
  const client = new pg.Client(typeof connection === "string" ? { connectionString: connection } : connection);
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(CREATE_JOURNAL);
    const result = await client.query<AppliedMigration>(`SELECT name, checksum FROM ${JOURNAL}`);
    const pending = planMigrations(files, result.rows);

    const appliedNow: string[] = [];
    for (const file of pending) {
      try {
        await client.query("BEGIN");
        await client.query(file.sql); // no parameters, so the whole script runs as one multi-statement query
        await client.query(`INSERT INTO ${JOURNAL} (name, checksum) VALUES ($1, $2)`, [file.name, checksum(file.sql)]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw new Error(`Migration ${file.name} failed and was rolled back`, { cause: error });
      }
      log(`applied ${file.name}`);
      appliedNow.push(file.name);
    }
    return appliedNow;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    await client.end();
  }
}
