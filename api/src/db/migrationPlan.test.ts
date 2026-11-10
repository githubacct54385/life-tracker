import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { checksum, MigrationError, planMigrations } from "./migrationPlan.js";

const file = (name: string, sql = "SELECT 1;") => ({ name, sql });
const done = (f: { name: string; sql: string }) => ({ name: f.name, checksum: checksum(f.sql) });

describe("planMigrations", () => {
  it("[AC-FND-03.1] returns every file, in order, when nothing is applied", () => {
    const plan = planMigrations([file("0002_b.sql"), file("0001_a.sql")], []);
    expect(plan.map((f) => f.name)).toEqual(["0001_a.sql", "0002_b.sql"]);
  });

  it("[AC-FND-03.1] returns nothing when everything is applied (repeatable)", () => {
    const files = [file("0001_a.sql"), file("0002_b.sql")];
    expect(planMigrations(files, files.map(done))).toEqual([]);
  });

  it("[AC-FND-03.1] returns only the new files", () => {
    const a = file("0001_a.sql");
    expect(planMigrations([a, file("0002_b.sql")], [done(a)]).map((f) => f.name)).toEqual(["0002_b.sql"]);
  });

  it("[AC-FND-03.5] refuses when an applied file has changed", () => {
    const a = file("0001_a.sql");
    const changed = file("0001_a.sql", "SELECT 2;");
    expect(() => planMigrations([changed], [done(a)])).toThrow(/already applied but its file has changed/);
  });

  it("[AC-FND-03.5] refuses when an applied file is missing", () => {
    expect(() => planMigrations([], [done(file("0001_a.sql"))])).toThrow(MigrationError);
  });

  it("[AC-FND-03.5] ignores line-ending differences", () => {
    const a = file("0001_a.sql", "SELECT 1;\nSELECT 2;\n");
    const crlf = file("0001_a.sql", "SELECT 1;\r\nSELECT 2;\r\n");
    expect(planMigrations([crlf], [done(a)])).toEqual([]);
  });

  it("[AC-FND-03.5] refuses a new file that sorts before an applied one", () => {
    const b = file("0002_b.sql");
    expect(() => planMigrations([file("0001_a.sql"), b], [done(b)])).toThrow(/older than an applied/);
  });

  it("[AC-FND-03.1] rejects bad names and duplicate numbers", () => {
    expect(() => planMigrations([file("create_accounts.sql")], [])).toThrow(/Bad migration file name/);
    expect(() => planMigrations([file("0001_a.sql"), file("0001_b.sql")], [])).toThrow(/share the number/);
  });

  it("[AC-FND-03.5] any change to the text changes the checksum", () => {
    fc.assert(
      fc.property(fc.string(), fc.string({ minLength: 1 }), (text, extra) => {
        fc.pre(!/[\r\uFEFF]/.test(text + extra));
        expect(checksum(text)).not.toBe(checksum(text + extra));
      }),
    );
  });
});
