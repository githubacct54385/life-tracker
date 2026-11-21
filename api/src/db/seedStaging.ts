import pg from "pg";
import { SeedRefusal } from "./stagingGuard.js";
import type { StagingSeed } from "./stagingSeed.js";

// Writes the sample data (stagingSeed.ts) into a database with the ADMIN connection. Never call this from the app (hard rule 10),
// and the command line refuses any database that is not named lt_staging (stagingGuard.ts). The tables are listed children first.
const TABLES = ["maintenance_documents", "maintenance_records", "service_places", "workouts", "weight_entries", "special_contributions", "regular_gifts", "odometer_readings"] as const;

export type SeedCounts = Record<"odometer" | "weights" | "workouts" | "gifts" | "specials" | "places" | "maintenance", number>;

async function rowCount(client: pg.Client): Promise<number> {
  const parts = TABLES.map((table) => `(SELECT count(*) FROM ${table})`).join(" + ");
  const { rows } = await client.query<{ total: string }>(`SELECT (${parts})::text AS total`);
  return Number(rows[0]?.total ?? 0);
}

/**
 * Fills an empty database with the sample data, in one transaction, so a failure leaves nothing half written.
 * With `reset`, every table is emptied first and the ids start again from 1. Without it, a database that already
 * has rows is refused, so running the command twice cannot double the data. Documents in the bucket are not touched:
 * a reset removes their rows, and a file with no row is never listed or served (ADR-0024).
 */
export async function seedStaging(connection: string | pg.ClientConfig, seed: StagingSeed, options: { reset: boolean }): Promise<SeedCounts> {
  const client = new pg.Client(typeof connection === "string" ? { connectionString: connection } : connection);
  await client.connect();
  try {
    await client.query("BEGIN");
    // Every row belongs to a person (SET-04), so the sample data goes to the staging admin. That row is made the first time the owner
    // opens the staging site, so open it once before seeding.
    const owner = (await client.query<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id LIMIT 1")).rows[0]?.id;
    if (owner === undefined) throw new SeedRefusal("There is no admin person yet, and every row needs one. Open the staging site once, signed in as the owner, then run the seed again.");

    if (options.reset) {
      await client.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY`);
    } else if ((await rowCount(client)) > 0) {
      throw new SeedRefusal("The database already has data. Run it again with --reset to replace that data with the sample data.");
    }

    await client.query("INSERT INTO odometer_readings (reading_date, miles, user_id) SELECT t.*, $3::bigint FROM unnest($1::date[], $2::int[]) AS t", [seed.odometer.map((r) => r.date), seed.odometer.map((r) => r.miles), owner]);
    await client.query("INSERT INTO weight_entries (entry_date, pounds, user_id) SELECT t.*, $3::bigint FROM unnest($1::date[], $2::numeric[]) AS t", [seed.weights.map((r) => r.date), seed.weights.map((r) => r.pounds), owner]);
    await client.query(
      "INSERT INTO workouts (workout_date, workout_type, minutes, reps, note, source, user_id) SELECT t.*, $7::bigint FROM unnest($1::date[], $2::text[], $3::int[], $4::int[], $5::text[], $6::text[]) AS t",
      [seed.workouts.map((r) => r.date), seed.workouts.map((r) => r.type), seed.workouts.map((r) => r.minutes), seed.workouts.map((r) => r.reps), seed.workouts.map((r) => r.note), seed.workouts.map((r) => r.source), owner],
    );
    await client.query(
      "INSERT INTO regular_gifts (given_on, for_month, amount, method, description, user_id) SELECT t.*, $6::bigint FROM unnest($1::date[], $2::date[], $3::numeric[], $4::text[], $5::text[]) AS t",
      [seed.gifts.map((r) => r.givenOn), seed.gifts.map((r) => r.forMonth), seed.gifts.map((r) => r.amount), seed.gifts.map((r) => r.method), seed.gifts.map((r) => r.description), owner],
    );
    await client.query(
      "INSERT INTO special_contributions (given_on, occasion, amount, method, user_id) SELECT t.*, $5::bigint FROM unnest($1::date[], $2::text[], $3::numeric[], $4::text[]) AS t",
      [seed.specials.map((r) => r.givenOn), seed.specials.map((r) => r.occasion), seed.specials.map((r) => r.amount), seed.specials.map((r) => r.method), owner],
    );

    const placeIds = new Map<string, number>();
    for (const name of seed.places) {
      const { rows } = await client.query<{ id: string }>("INSERT INTO service_places (name, user_id) VALUES ($1, $2) RETURNING id", [name, owner]);
      placeIds.set(name, Number(rows[0]!.id));
    }
    for (const record of seed.maintenance) {
      await client.query(
        "INSERT INTO maintenance_records (service_date, odometer_miles, done_by, place_id, cost_cents, note, services, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [record.date, record.odometerMiles, record.doneBy, record.place === null ? null : placeIds.get(record.place), record.costCents, record.note, record.services, owner],
      );
    }

    await client.query("COMMIT");
    return {
      odometer: seed.odometer.length,
      weights: seed.weights.length,
      workouts: seed.workouts.length,
      gifts: seed.gifts.length,
      specials: seed.specials.length,
      places: seed.places.length,
      maintenance: seed.maintenance.length,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
