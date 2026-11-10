import { getPool } from "../db/connection.js";

/** Cheapest possible round trip, used to check the database is reachable. */
export async function ping(): Promise<boolean> {
  const result = await getPool().query<{ ok: number }>("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}
