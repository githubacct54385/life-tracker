// Prepares the database for the browser tests (OPS-04). Run first by the web server command in playwright.config.ts.
//
// It starts from an empty schema, applies the real migrations with the same command the Release workflow uses
// (`pnpm migrate`), creates the least-privilege app role with the real grants (db/setup/app-role-grants.sql), and writes the
// app role's connection string to api/.dev.vars, which `wrangler dev` reads. So the Worker in the tests runs exactly as it
// does in production: Access token, owner check, handler, service, SQL, and the same restricted database role.
//
// Safety: it only runs against a local database whose name contains "e2e", because it drops the schemas first.
// The password is made up on each run and only ever written to the git-ignored api/.dev.vars.
//
// E2E_ADMIN_DATABASE_URL, for example postgresql://postgres:postgres@127.0.0.1:5432/lt_e2e (CI sets it for its Postgres service).
// Without it, nothing is prepared and the real-stack specs skip when run locally. In CI it is required.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const devVars = path.join(root, "api/.dev.vars");
const adminUrl = process.env.E2E_ADMIN_DATABASE_URL;

/** Sets or removes the DATABASE_URL line of api/.dev.vars and leaves every other line (a developer's own settings) alone. */
function setDatabaseUrl(value) {
  const lines = existsSync(devVars) ? readFileSync(devVars, "utf8").split("\n") : [];
  const kept = lines.filter((line) => line.trim() !== "" && !line.startsWith("DATABASE_URL="));
  if (value) kept.push(`DATABASE_URL=${value}`);
  writeFileSync(devVars, kept.length > 0 ? kept.join("\n") + "\n" : "");
}

if (!adminUrl) {
  if (process.env.CI) {
    console.error("E2E_ADMIN_DATABASE_URL is not set. The browser tests need a Postgres database in CI.");
    process.exit(1);
  }
  console.warn("E2E_ADMIN_DATABASE_URL is not set: the browser tests that use the real database will be skipped.");
  setDatabaseUrl(undefined);
  process.exit(0);
}

const url = new URL(adminUrl);
const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname) || !/e2e/i.test(database)) {
  console.error("Refusing to prepare the database: it must be on this computer and its name must contain 'e2e'.");
  process.exit(1);
}

const { Client } = createRequire(path.join(root, "api/package.json"))("pg");
const admin = new Client({ connectionString: adminUrl });
await admin.connect();
try {
  // An empty start: no tables, no migration journal, no leftovers from an earlier run.
  await admin.query("DROP SCHEMA IF EXISTS public CASCADE");
  await admin.query("DROP SCHEMA IF EXISTS migrations CASCADE");
  await admin.query("CREATE SCHEMA public");
} finally {
  await admin.end();
}

const migrate = spawnSync("pnpm", ["--filter", "@life-tracker/api", "migrate"], { cwd: root, env: { ...process.env, DATABASE_ADMIN_URL: adminUrl }, encoding: "utf8" });
if (migrate.status !== 0) {
  console.error("Migrations failed:\n" + (migrate.stdout ?? "") + (migrate.stderr ?? ""));
  process.exit(1);
}

const password = randomBytes(24).toString("hex");
const grants = readFileSync(path.join(root, "db/setup/app-role-grants.sql"), "utf8");
const setup = new Client({ connectionString: adminUrl });
await setup.connect();
try {
  const exists = (await setup.query("SELECT 1 FROM pg_roles WHERE rolname = 'lt_app'")).rowCount > 0;
  const literal = `'${password}'`; // hex only, so there is nothing to escape
  await setup.query(exists ? `ALTER ROLE lt_app WITH LOGIN PASSWORD ${literal}` : `CREATE ROLE lt_app WITH LOGIN PASSWORD ${literal} NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  await setup.query(`GRANT CONNECT ON DATABASE "${database.replace(/"/g, '""')}" TO lt_app`);
  await setup.query(grants);
} finally {
  await setup.end();
}

const app = new URL(adminUrl);
app.username = "lt_app";
app.password = password;
app.search = "?sslmode=disable";
setDatabaseUrl(app.toString());
console.log(`Database ${database} is ready: migrated, and the Worker will connect as the app role.`);
