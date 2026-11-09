import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sql from "mssql";
import { checksum, planMigrations, splitBatches, type AppliedMigration, type MigrationFile } from "./migrationPlan.js";

const JOURNAL = "dbo.SchemaMigrations";

const CREATE_JOURNAL = `
IF OBJECT_ID('${JOURNAL}', 'U') IS NULL
CREATE TABLE ${JOURNAL} (
  Name nvarchar(200) NOT NULL CONSTRAINT PK_SchemaMigrations PRIMARY KEY,
  Checksum char(64) NOT NULL,
  AppliedAtUtc datetime2 NOT NULL CONSTRAINT DF_SchemaMigrations_AppliedAtUtc DEFAULT SYSUTCDATETIME()
)`;

export async function readMigrationFiles(dir: string): Promise<MigrationFile[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith(".sql"));
  return Promise.all(names.map(async (name) => ({ name, sql: await readFile(path.join(dir, name), "utf8") })));
}

/**
 * Apply pending migrations with the ADMIN connection. Never call this from the app (hard rule 10).
 * Returns the names applied in this run (empty when up to date).
 */
export async function applyMigrations(
  connection: string | sql.config,
  files: MigrationFile[],
  log: (message: string) => void = () => {},
): Promise<string[]> {
  const pool = await new sql.ConnectionPool(connection as sql.config).connect();
  try {
    await pool.request().batch(CREATE_JOURNAL);
    const result = await pool.request().query<AppliedMigration>(`SELECT Name AS name, Checksum AS checksum FROM ${JOURNAL}`);
    const pending = planMigrations(files, result.recordset);

    const appliedNow: string[] = [];
    for (const file of pending) {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        for (const batch of splitBatches(file.sql)) {
          await new sql.Request(transaction).batch(batch);
        }
        await new sql.Request(transaction)
          .input("name", sql.NVarChar(200), file.name)
          .input("checksum", sql.Char(64), checksum(file.sql))
          .query(`INSERT INTO ${JOURNAL} (Name, Checksum) VALUES (@name, @checksum)`);
        await transaction.commit();
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw new Error(`Migration ${file.name} failed and was rolled back`, { cause: error });
      }
      log(`applied ${file.name}`);
      appliedNow.push(file.name);
    }
    return appliedNow;
  } finally {
    await pool.close();
  }
}
