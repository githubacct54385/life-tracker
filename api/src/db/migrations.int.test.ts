import { describe, expect, inject, it } from "vitest";
import { applyMigrations } from "./migrationRunner.js";
import { createAppRole, createFreshDatabase, run } from "./testDatabase.js";

// Synthetic migrations: the real ones live in db/migrations and are applied by the same code.
const CREATE_ITEM = {
  name: "0001_create_item.sql",
  sql: "CREATE TABLE public.item (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, label text NOT NULL, amount numeric(12,2));",
};
const ADD_NOTE = {
  name: "0002_add_note.sql",
  sql: "ALTER TABLE public.item ADD COLUMN note text;\nCREATE VIEW public.item_labels AS SELECT label FROM public.item;",
};
const BROKEN = { name: "0003_broken.sql", sql: "CREATE TABLE public.half (id int);\nSELECT * FROM public.does_not_exist;" };

// Skipped only when Docker is missing on a laptop (see globalSetup.int.ts). CI always runs them.
const server = inject("postgres");

describe.skipIf(!server)("migrations against Postgres", () => {
  const container = server!;

  it("[AC-FND-03.4][AC-FND-03.1][AC-MIG-02.2] applies from empty, records a journal, and a second run does nothing", async () => {
    const { admin } = await createFreshDatabase(container);
    expect(await applyMigrations(admin, [CREATE_ITEM, ADD_NOTE])).toEqual([CREATE_ITEM.name, ADD_NOTE.name]);
    expect(await applyMigrations(admin, [CREATE_ITEM, ADD_NOTE])).toEqual([]);

    const journal = await run<{ name: string; checksum: string }>(admin, "SELECT name, checksum FROM migrations.schema_migrations ORDER BY name");
    expect(journal.map((row) => row.name)).toEqual([CREATE_ITEM.name, ADD_NOTE.name]);
    expect(journal[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
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
    const columns = await run<{ n: string }>(admin, "SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'item' AND column_name = 'note'");
    expect(columns[0]?.n).toBe("0");
  });

  it("[AC-FND-03.1] rolls back a failed migration and does not record it", async () => {
    const { admin } = await createFreshDatabase(container);
    await applyMigrations(admin, [CREATE_ITEM]);
    await expect(applyMigrations(admin, [CREATE_ITEM, BROKEN])).rejects.toThrow(/0003_broken\.sql failed and was rolled back/);
    const half = await run<{ id: string | null }>(admin, "SELECT to_regclass('public.half')::text AS id");
    expect(half[0]?.id).toBeNull();
    const journal = await run<{ name: string }>(admin, "SELECT name FROM migrations.schema_migrations");
    expect(journal.map((row) => row.name)).toEqual([CREATE_ITEM.name]);
  });

  it("[AC-FND-03.1] two runs at once apply each file exactly once", async () => {
    const { admin } = await createFreshDatabase(container);
    const [first, second] = await Promise.all([applyMigrations(admin, [CREATE_ITEM, ADD_NOTE]), applyMigrations(admin, [CREATE_ITEM, ADD_NOTE])]);
    expect([...first, ...second].sort()).toEqual([CREATE_ITEM.name, ADD_NOTE.name]);
  });

  it("[AC-FND-03.2][AC-MIG-02.1] the app role can read and write app tables but cannot change the schema", async () => {
    const { admin, name } = await createFreshDatabase(container);
    await applyMigrations(admin, [CREATE_ITEM]);
    const app = await createAppRole(container, name);

    await run(app, "INSERT INTO public.item (label, amount) VALUES ('synthetic', 12.50)");
    await run(app, "UPDATE public.item SET label = 'changed' WHERE label = 'synthetic'");
    expect((await run<{ label: string }>(app, "SELECT label FROM public.item"))[0]?.label).toBe("changed");
    await run(app, "DELETE FROM public.item WHERE label = 'changed'");

    await expect(run(app, "CREATE TABLE public.sneaky (id int)")).rejects.toThrow(/permission denied/i);
    await expect(run(app, "ALTER TABLE public.item ADD COLUMN extra int")).rejects.toThrow(/must be owner/i);
    await expect(run(app, "DROP TABLE public.item")).rejects.toThrow(/must be owner/i);
    await expect(run(app, "TRUNCATE public.item")).rejects.toThrow(/permission denied/i); // TRUNCATE is not part of the write grant
  });

  it("[AC-FND-03.2][AC-MIG-02.1] the app role also covers tables added by later migrations, but cannot touch the journal", async () => {
    const { admin, name } = await createFreshDatabase(container);
    await applyMigrations(admin, [CREATE_ITEM]);
    const app = await createAppRole(container, name);
    await applyMigrations(admin, [CREATE_ITEM, ADD_NOTE]); // the view and column are new after the role existed
    await applyMigrations(admin, [CREATE_ITEM, ADD_NOTE, { name: "0003_more.sql", sql: "CREATE TABLE public.later (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, label text);" }]);

    await run(app, "INSERT INTO public.later (label) VALUES ('synthetic')"); // identity sequence works too
    expect((await run(app, "SELECT * FROM public.later")).length).toBe(1);
    await expect(run(app, "SELECT * FROM migrations.schema_migrations")).rejects.toThrow(/permission denied/i);
    await expect(run(app, "INSERT INTO migrations.schema_migrations (name, checksum) VALUES ('x', 'y')")).rejects.toThrow(/permission denied/i);
  });
});
