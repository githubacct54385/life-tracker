import { withRequestPool } from "../db/connection.js";

/**
 * Runs one request with its own database pool built from the Worker's `DATABASE_URL` secret.
 * It lives here because only `repositories/` may use `db/` (ARCHITECTURE.md); the Worker entry point calls it.
 */
export const withRequestDatabase = withRequestPool;
