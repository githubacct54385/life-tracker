// Proves the lint rule and dependency rules actually fail on violations (AC-FND-03.3, AC-FND-03.6).
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bin = (name: string) => path.join(root, "node_modules/.bin", name);
const sandboxes: string[] = [];

afterAll(() => sandboxes.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function lintText(code: string, filePath: string) {
  const run = spawnSync(bin("eslint"), ["--stdin", "--stdin-filename", path.join(root, filePath), "--format", "json"], {
    cwd: root,
    input: code,
    encoding: "utf8",
  });
  const messages: { ruleId: string | null }[] = JSON.parse(run.stdout)[0].messages;
  return messages.filter((m) => m.ruleId === "no-restricted-syntax");
}

describe("SQL only in repositories", () => {
  const sqlCode = 'export const q = "SELECT Id FROM dbo.Item WHERE Id = @id";';

  it("[AC-FND-03.3] fails when SQL text appears in a service", () => {
    expect(lintText(sqlCode, "api/src/services/itemService.ts")).toHaveLength(1);
  });

  it("[AC-FND-03.3] fails for SQL in a handler template string and in a page", () => {
    expect(lintText("export const q = `INSERT INTO dbo.Item (Id) VALUES (${1})`;", "api/src/handlers/h.ts")).toHaveLength(1);
    expect(lintText('export const q = "DELETE FROM dbo.Item";', "web/src/pages/Home.tsx")).toHaveLength(1);
  });

  it("[AC-FND-03.3] allows the same SQL in a repository", () => {
    expect(lintText(sqlCode, "api/src/repositories/itemRepository.ts")).toHaveLength(0);
  });

  it("[AC-FND-03.3] does not flag ordinary text", () => {
    expect(lintText('export const t = "Select a file from your computer";', "web/src/pages/Home.tsx")).toHaveLength(0);
  });
});

describe("layer rules", () => {
  function cruise(files: Record<string, string>) {
    const dir = mkdtempSync(path.join(tmpdir(), "layers-"));
    sandboxes.push(dir);
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      writeFileSync(path.join(dir, name), content);
    }
    mkdirSync(path.join(dir, "api/src"), { recursive: true });
    mkdirSync(path.join(dir, "web/src"), { recursive: true });
    cpSync(path.join(root, "tsconfig.base.json"), path.join(dir, "tsconfig.base.json"));
    const run = spawnSync(bin("depcruise"), ["api/src", "web/src", "--config", path.join(root, ".dependency-cruiser.js")], {
      cwd: dir,
      encoding: "utf8",
    });
    return { failed: run.status !== 0, output: run.stdout + run.stderr };
  }

  const violations: [string, Record<string, string>, string][] = [
    ["a service imports a handler", { "api/src/services/s.ts": 'import "../handlers/h";', "api/src/handlers/h.ts": "export {};" }, "layers-point-down"],
    ["a handler imports a repository", { "api/src/handlers/h.ts": 'import "../repositories/r";', "api/src/repositories/r.ts": "export {};" }, "handlers-not-skip-layers"],
    ["a service imports db", { "api/src/services/s.ts": 'import "../db/connection";', "api/src/db/connection.ts": "export {};" }, "services-not-skip-layers"],
    ["a repository imports a service", { "api/src/repositories/r.ts": 'import "../services/s";', "api/src/services/s.ts": "export {};" }, "repositories-not-up"],
    ["db imports a repository", { "api/src/db/c.ts": 'import "../repositories/r";', "api/src/repositories/r.ts": "export {};" }, "db-is-bottom"],
    ["a handler imports pg", { "api/src/handlers/h.ts": 'import "pg";', "node_modules/pg/index.js": "" }, "sql-only-in-repositories"],
    ["the api client imports a page", { "web/src/api/client.ts": 'import "../pages/P";', "web/src/pages/P.ts": "export {};" }, "web-client-not-up"],
  ];

  it.each(violations)("[AC-FND-03.6] fails when %s", (_label, files, rule) => {
    const result = cruise(files);
    expect(result.failed).toBe(true);
    expect(result.output).toContain(rule);
  });

  it("[AC-FND-03.6] passes for the allowed direction", () => {
    const result = cruise({
      "api/src/handlers/h.ts": 'import "../services/s";',
      "api/src/services/s.ts": 'import "../repositories/r";',
      "api/src/repositories/r.ts": 'import "../db/connection";',
      "api/src/db/connection.ts": "export {};",
      "web/src/pages/P.ts": 'import "../api/client";',
      "web/src/api/client.ts": "export {};",
    });
    expect(result.output).not.toMatch(/error/i);
    expect(result.failed).toBe(false);
  });
});
