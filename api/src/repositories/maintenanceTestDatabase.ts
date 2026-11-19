// Test support only (used by *.int.test.ts): helpers for the maintenance tables on the throwaway database from odometerTestDatabase.ts.
import { getPool } from "../db/connection.js";

export async function clearMaintenance(): Promise<void> {
  await getPool().query("DELETE FROM maintenance_records");
  await getPool().query("DELETE FROM service_places");
}
