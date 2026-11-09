import sql from "mssql";
import { describe, expect, inject, it } from "vitest";
import { applyMigrations } from "./migrationRunner.js";
import { createAppLogin, createFreshDatabase } from "./testDatabase.js";

// Synthetic migrations: the real ones live in db/migrations and are applied by the same code.
const CREATE_ITEM = { name: "0001_create_item.sql", sql: "CREATE TABLE dbo.Item (Id int NOT NULL PRIMARY KEY, Label nvarchar(50) NOT NULL);" };
const ADD_NOTE = { name: "0002_add_note.sql", sql: "ALTER TABLE dbo.Item ADD Note nvarchar(100) NULL;\nGO\nCREATE VIEW dbo.ItemLabels AS SELECT Label FROM dbo.Item;" };
const BROKEN = { name: "0003_broken.sql", sql: "CREATE TABLE dbo.Half (Id int);\nGO\nSELECT * FROM dbo.DoesNotExist;" };

async function query<T>(config: sql.config, text: string): Promise<T[]> {
  const pool = await new sql.ConnectionPool(config).connect();
  try {
    return (await pool.request().query<T>(text)).recordset;
  } finally {
    await pool.close();
  }
}

// Skipped only when Docker is missing on a laptop (see globalSetup.int.ts). CI always runs them.
const server = inject("sqlServer");

describe.skipIf(!server)("migrations against SQL Server", () => {
  const container = server!;

  it("[AC-FND-03.4][AC-FND-03.1] applies from empty, records a journal, and a second run does nothing", async () => {
    const { admin } = await createFreshDatabase(container);
    expect(await applyMigrations(admin, [CREATE_ITEM, ADD_NOTE])).toEqual([CREATE_ITEM.name, ADD_NOTE.name]);
    expect(await applyMigrations(admin, [CREATE_ITEM, ADD_NOTE])).toEqual([]);

    const journal = await query<{ Name: string; Checksum: string }>(admin, "SELECT Name, Checksum FROM dbo.SchemaMigrations ORDER BY Name");
    expect(journal.map((row) => row.Name)).toEqual([CREATE_ITEM.name, ADD_NOTE.name]);
    expect(journal[0]?.Checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("[AC-FND-03.1] applies only the new file on a later run", async () => {
    const { admin } = await createFreshDatabase(container);
    await applyMigrations(admin, [CREATE_ITEM]);
    expect(await applyMigrations(admin, [CREATE_ITEM, ADD_NOTE])).toEqual([ADD_NOTE.name]);
  });

  it("[AC-FND-03.5] refuses to run when an applied file changed, and changes nothing", async () => {
    const { admin } = await createFreshDatabase(container);
    await applyMigrations(admin, [CREATE_ITEM]);
    const edited = { ...CREATE_ITEM, sql: `${CREATE_ITEM.sql}\n-- edited` };
    await expect(applyMigrations(admin, [edited, ADD_NOTE])).rejects.toThrow(/already applied but its file has changed/);
    const columns = await query<{ n: number }>(admin, "SELECT COUNT(*) AS n FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Item') AND name = 'Note'");
    expect(columns[0]?.n).toBe(0);
  });

  it("[AC-FND-03.1] rolls back a failed migration and does not record it", async () => {
    const { admin } = await createFreshDatabase(container);
    await applyMigrations(admin, [CREATE_ITEM]);
    await expect(applyMigrations(admin, [CREATE_ITEM, BROKEN])).rejects.toThrow(/0003_broken\.sql failed and was rolled back/);
    const half = await query<{ id: number | null }>(admin, "SELECT OBJECT_ID('dbo.Half') AS id");
    expect(half[0]?.id).toBeNull();
    const journal = await query<{ Name: string }>(admin, "SELECT Name FROM dbo.SchemaMigrations");
    expect(journal.map((row) => row.Name)).toEqual([CREATE_ITEM.name]);
  });

  it("[AC-FND-03.2] the app login can read and write app tables but cannot change the schema", async () => {
    const { admin, name } = await createFreshDatabase(container);
    await applyMigrations(admin, [CREATE_ITEM]);
    const app = await createAppLogin(container, name);

    await query(app, "INSERT INTO dbo.Item (Id, Label) VALUES (1, N'synthetic')");
    await query(app, "UPDATE dbo.Item SET Label = N'changed' WHERE Id = 1");
    expect((await query<{ Label: string }>(app, "SELECT Label FROM dbo.Item"))[0]?.Label).toBe("changed");
    await query(app, "DELETE FROM dbo.Item WHERE Id = 1");

    await expect(query(app, "CREATE TABLE dbo.Sneaky (Id int)")).rejects.toThrow(/permission/i);
    await expect(query(app, "ALTER TABLE dbo.Item ADD Extra int NULL")).rejects.toThrow(/permission/i);
    await expect(query(app, "DROP TABLE dbo.Item")).rejects.toThrow(/permission/i);
  });
});
