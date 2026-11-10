import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-hygiene.sh");
const dirs = [];

function runWithMigration(sql) {
  const repo = mkdtempSync(path.join(os.tmpdir(), "hygiene-"));
  dirs.push(repo);
  const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  git("init", "-q");
  mkdirSync(path.join(repo, "scripts"));
  copyFileSync(script, path.join(repo, "scripts/check-hygiene.sh"));
  mkdirSync(path.join(repo, "db/migrations"), { recursive: true });
  writeFileSync(path.join(repo, "db/migrations/0002_change.sql"), sql);
  git("add", "-A");
  return spawnSync("bash", ["scripts/check-hygiene.sh"], { cwd: repo, encoding: "utf8" });
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

describe("destructive migration check", () => {
  it.each([
    "DROP TABLE dbo.Thing;",
    "ALTER TABLE dbo.Thing DROP COLUMN Old;",
    "ALTER TABLE dbo.Thing ALTER COLUMN Name NVARCHAR(10) NOT NULL;",
    "TRUNCATE TABLE dbo.Thing;",
    // Postgres spellings (AC-MIG-02.5)
    "ALTER TABLE public.thing RENAME TO other;",
    "ALTER TABLE public.thing RENAME COLUMN old TO new;",
    "ALTER TABLE public.thing ALTER COLUMN name TYPE varchar(10);",
    "ALTER TABLE public.thing ALTER name SET DATA TYPE varchar(10);",
    "TRUNCATE public.thing;",
    "DROP SCHEMA reporting CASCADE;",
    "ALTER TABLE public.thing DROP COLUMN IF EXISTS old;",
  ])("[AC-FND-06.5][AC-MIG-02.5] fails on a destructive statement without the marker: %s", (sql) => {
    const result = runWithMigration(`${sql}\n`);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("allow-destructive");
  });

  it("[AC-FND-06.5] passes when the file carries the explicit marker", () => {
    const result = runWithMigration("-- allow-destructive\nDROP TABLE dbo.Thing;\n");
    expect(result.status).toBe(0);
  });

  it("[AC-FND-06.5] passes for an additive migration", () => {
    const result = runWithMigration("ALTER TABLE dbo.Thing ADD Extra INT NULL;\n");
    expect(result.status).toBe(0);
  });

  it("[AC-MIG-02.5] passes for additive Postgres migrations", () => {
    const result = runWithMigration(
      "CREATE TABLE public.thing (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, amount numeric(12,2) NOT NULL);\n" +
        "ALTER TABLE public.thing ADD COLUMN note text;\nCREATE INDEX thing_amount_idx ON public.thing (amount);\n",
    );
    expect(result.status).toBe(0);
  });
});
