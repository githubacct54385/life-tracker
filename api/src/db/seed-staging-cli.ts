// Run with `pnpm seed:staging` (add `--reset` to empty the database first). Uses DATABASE_ADMIN_URL (the admin role).
// Fills the STAGING database with sample data (OPS-08, ADR-0025). It refuses any database that is not named lt_staging.
// Not part of the deployed API. Prints counts and fixed messages only, never the connection address or any row.
import { seedStaging } from "./seedStaging.js";
import { SeedRefusal, assertStagingDatabase } from "./stagingGuard.js";
import { buildStagingSeed } from "./stagingSeed.js";

const connection = process.env.DATABASE_ADMIN_URL;
if (!connection) {
  console.error("DATABASE_ADMIN_URL is not set.");
  process.exit(1);
}
const reset = process.argv.includes("--reset");

try {
  assertStagingDatabase(connection);
  const today = new Date().toISOString().slice(0, 10);
  const counts = await seedStaging(connection, buildStagingSeed(today), { reset });
  console.log(reset ? "Staging was emptied and filled with sample data:" : "Staging was filled with sample data:");
  for (const [table, count] of Object.entries(counts)) console.log(`  ${table}: ${count}`);
} catch (error) {
  // Only our own refusals have text that is safe to print. Anything else gets the database's error code, never its message,
  // because a connection error can repeat part of the address.
  if (error instanceof SeedRefusal) console.error(error.message);
  else console.error(`Seeding failed${error instanceof Error && "code" in error ? ` (${String(error.code)})` : ""}. Nothing was changed.`);
  process.exit(1);
}
