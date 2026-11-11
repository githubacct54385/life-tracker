// AC-SET-03.3: the repo holds no data files and no bank-transaction code or schema (ADR-0021 removed finance).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);

describe("repo scan", () => {
  it("[AC-SET-03.3] no CSV, spreadsheet, export, or database dump files are tracked", () => {
    const bad = tracked.filter((f) => /(\.csv$|\.xlsx?$|\.xlsm$|\.bacpac$|\.sqlite$|(^|\/)export(_cda)?\.(xml|zip)$|(^|\/)apple_health_export\/)/i.test(f));
    expect(bad).toEqual([]);
  });

  it("[AC-SET-03.3] no code or schema for bank transactions exists", () => {
    const code = tracked.filter((f) => /^(api\/src|web\/src|shared|db)\//.test(f) && /\.(ts|tsx|sql)$/.test(f) && !/\.test\./.test(f));
    const offenders = code.filter((f) => /\b(bank_?transactions?|transactions?_?(table|import)|create\s+table\s+\S*transactions?|account_?number|iban|routing_?number)\b/i.test(readFileSync(path.join(root, f), "utf8")));
    expect(offenders).toEqual([]);
    expect(tracked.filter((f) => /transaction/i.test(f) && !f.endsWith(".md"))).toEqual([]);
  });
});
