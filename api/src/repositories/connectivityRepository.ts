import { getPool } from "../db/connection.js";

/** Cheapest possible round trip, used to check the database is reachable. */
export async function ping(): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request().query<{ ok: number }>("SELECT 1 AS ok");
  return result.recordset[0]?.ok === 1;
}
