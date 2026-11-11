// Test support only (used by *.int.test.ts, never by production code). Reuses the odometer helpers for the throwaway
// database; it lives in repositories/ because only that layer may use db/.
import { getPool } from "../db/connection.js";

export { connectFreshAppDatabase, disconnectAppDatabase } from "./odometerTestDatabase.js";

export async function clearGifts(): Promise<void> {
  await getPool().query("DELETE FROM regular_gifts");
}
