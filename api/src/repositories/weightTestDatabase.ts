// Test support only (used by *.int.test.ts): helpers for the weight_entries table on the throwaway database from odometerTestDatabase.ts.
import { getPool } from "../db/connection.js";

export async function clearWeight(): Promise<void> {
  await getPool().query("DELETE FROM weight_entries");
}
