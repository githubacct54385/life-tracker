// Empties every app table between full-stack tests (OPS-04). Test tooling, next to prepareDatabase.mjs: it talks to the
// throwaway browser-test database with the admin address, never through the app. `pg` comes from the api package.
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../api/package.json", import.meta.url));

export async function resetDatabase(adminUrl) {
  const { Client } = require("pg");
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    // The migration journal lives in another schema and is left alone.
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).rows.map((r) => `"${r.tablename}"`);
    if (tables.length > 0) await client.query(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
}
