// Run with `pnpm migrate`. Uses DATABASE_ADMIN_URL (the admin role). Not part of the deployed API.
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations, readMigrationFiles } from "./migrationRunner.js";

const connection = process.env.DATABASE_ADMIN_URL;
if (!connection) {
  console.error("DATABASE_ADMIN_URL is not set.");
  process.exit(1);
}

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../db/migrations");

try {
  const files = await readMigrationFiles(dir);
  const applied = await applyMigrations(connection, files, console.log);
  console.log(applied.length === 0 ? "Database is up to date." : `Applied ${applied.length} migration(s).`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const list = applied.length === 0 ? "none (already up to date)" : applied.map((name) => `\`${name}\``).join(", ");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `**Migrations applied:** ${list}\n`);
  }
} catch (error) {
  // Print the message and cause text only, never the connection string.
  console.error(error instanceof Error ? error.message : "Migration failed");
  if (error instanceof Error && error.cause instanceof Error) console.error(error.cause.message);
  process.exit(1);
}
