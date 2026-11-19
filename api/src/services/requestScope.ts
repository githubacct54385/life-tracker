import { withRequestDocuments } from "../repositories/documentStore.js";
import { withRequestDatabase } from "../repositories/requestDatabase.js";

/** Runs one API request with its own database connection (see repositories/requestDatabase.ts). The Worker entry point uses this. */
export const runWithDatabase = withRequestDatabase;

/** Runs one API request with its R2 bucket (see repositories/documentStore.ts). */
export const runWithDocuments = withRequestDocuments;

export type { DocumentBucket } from "../repositories/documentStore.js";
