// The seed script fills a database with sample data and can empty it first. It must never be pointed at real data
// (OPS-08, ADR-0025). The one rule: the database must be named `lt_staging`, the name the staging guide tells the owner to give it.
// Production's database has a different name, so a mix-up of two connection strings stops here.

export const STAGING_DATABASE = "lt_staging";

/** Thrown for a refusal. Its message is fixed text and never holds the connection address or any part of it. */
export class SeedRefusal extends Error {}

/** Throws a SeedRefusal unless the connection address names the staging database. */
export function assertStagingDatabase(connection: string): void {
  let database: string;
  try {
    database = decodeURIComponent(new URL(connection).pathname.replace(/^\//, ""));
  } catch {
    throw new SeedRefusal("DATABASE_ADMIN_URL is not a valid connection address.");
  }
  if (database !== STAGING_DATABASE) {
    throw new SeedRefusal(`Refusing to run: the database is not named ${STAGING_DATABASE}. This script only fills the staging database.`);
  }
}
