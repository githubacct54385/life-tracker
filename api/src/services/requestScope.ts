import { withRequestDatabase } from "../repositories/requestDatabase.js";

/** Runs one API request with its own database connection (see repositories/requestDatabase.ts). The Worker entry point uses this. */
export const runWithDatabase = withRequestDatabase;
