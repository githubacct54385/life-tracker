import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

// OPS-04: the browser tests run the real stack. These check the safety rules of the database setup step and the way CI wires it.
// The refusals exit before anything is read or written, so they never touch a database or api/.dev.vars.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "web/e2e/support/prepareDatabase.mjs");

function run(env) {
  const clean = { PATH: process.env.PATH, HOME: process.env.HOME };
  return spawnSync("node", [script], { cwd: root, env: { ...clean, ...env }, encoding: "utf8" });
}

describe("browser test database setup", () => {
  it("[AC-OPS-04.1] refuses a database that is not on this computer, even if its name says e2e", () => {
    const result = run({ E2E_ADMIN_DATABASE_URL: "postgresql://postgres:x@db.example.test:5432/lt_e2e" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing");
  });

  it("[AC-OPS-04.1] refuses a local database whose name does not contain e2e, so it can never wipe a real one", () => {
    for (const name of ["life_tracker", "postgres", "production", "lt_app"]) {
      const result = run({ E2E_ADMIN_DATABASE_URL: `postgresql://postgres:x@127.0.0.1:5432/${name}` });
      expect(result.status, name).toBe(1);
      expect(result.stderr, name).toContain("Refusing");
    }
  });

  it("[AC-OPS-04.1][AC-OPS-04.5] in CI a missing database setting fails the job instead of quietly skipping the real tests", () => {
    const result = run({ CI: "true" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("E2E_ADMIN_DATABASE_URL is not set");
  });

  it("[AC-OPS-04.1] the setup uses the real migrations command and the real app-role grants, and writes the password only to .dev.vars", () => {
    const text = readFileSync(script, "utf8");
    expect(text).toContain('"@life-tracker/api", "migrate"');
    expect(text).toContain("db/setup/app-role-grants.sql");
    expect(text).toContain("NOSUPERUSER");
    expect(text).toContain("randomBytes");
    expect(text).not.toMatch(/console\.(log|error)\([^)]*password/i);
  });
});

describe("CI runs the browser tests against Postgres", () => {
  const ci = parse(readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8"));
  const job = ci.jobs.test;
  const e2e = job.steps.find((step) => /test:e2e/.test(step.run ?? ""));

  it("[AC-OPS-04.2] the test job has a Postgres service, healthy before the steps start, on the port the tests use", () => {
    const postgres = job.services?.postgres;
    expect(postgres?.image).toMatch(/^postgres:/);
    expect(postgres.env.POSTGRES_DB).toMatch(/e2e/);
    expect(postgres.ports.map(String)).toContain("5432:5432");
    expect(postgres.options).toContain("--health-cmd");
  });

  it("[AC-OPS-04.2][AC-OPS-04.5] the end-to-end step is given the database address, so no request can reach a Worker without a database", () => {
    expect(e2e).toBeDefined();
    expect(e2e.env.E2E_ADMIN_DATABASE_URL).toMatch(/@127\.0\.0\.1:5432\/lt_e2e$/);
  });

  it("[AC-OPS-04.2] the browser test server prepares the database before it builds and serves the app", () => {
    const config = readFileSync(path.join(root, "web/playwright.config.ts"), "utf8");
    const prepare = config.indexOf("node e2e/support/prepareDatabase.mjs &&");
    expect(prepare).toBeGreaterThan(-1);
    expect(prepare).toBeLessThan(config.indexOf("pnpm build"));
    expect(prepare).toBeLessThan(config.indexOf("wrangler dev --port"));
    expect(config).toContain("workers: 1");
  });
});

describe("TESTING.md", () => {
  const text = readFileSync(path.join(root, "TESTING.md"), "utf8");

  it("[AC-OPS-04.6] says which browser tests use the real stack, which fake the API, and how to run them locally", () => {
    expect(text).toContain("e2e/stack/");
    expect(text).toContain("E2E_ADMIN_DATABASE_URL");
    expect(text).toMatch(/fake the API|fakes? the API|replace the API/i);
  });
});
