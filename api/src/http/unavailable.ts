// What counts as "a part the Worker depends on is not available" (OPS-14), in one place. Nothing here reads an error's message into a
// response or a log: the message is looked at only to tell a down service from a bug, and is never kept.
import type { DependencyPart } from "@life-tracker/shared";
import { errorCodeOf } from "../telemetry/logger.js";

/** Thrown where a part is known to be down, for example when the document store fails. The app answers 503 and names the part. */
export class DependencyUnavailable extends Error {
  constructor(readonly part: DependencyPart) {
    super(`Dependency not available: ${part}`);
    this.name = "DependencyUnavailable";
  }
}

// Postgres connection-class codes (08xxx), admin shutdown and crash recovery (57P0x), too many connections (53300), and the Node network codes.
const DATABASE_DOWN_CODE = /^(08[0-9A-Z]{3}|57P0[1-3]|53300|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|EHOSTUNREACH|ENETUNREACH)$/;
// The pg and Neon drivers also fail with a plain message and no code when a connection cannot be made or is cut.
const DATABASE_DOWN_MESSAGE = /Connection terminated|timeout exceeded when trying to connect|Client has encountered a connection error|Connection error|connect ECONN/i;

/** The part an error says is down, or undefined when it is an ordinary bug or a bad request. */
export function unavailablePartOf(error: unknown): DependencyPart | undefined {
  if (error instanceof DependencyUnavailable) return error.part;
  const code = errorCodeOf(error);
  if (code !== undefined && DATABASE_DOWN_CODE.test(code)) return "database";
  if (error instanceof Error && DATABASE_DOWN_MESSAGE.test(error.message)) return "database";
  return undefined;
}

/** For a `catch` that would answer 500: let a down part through to the one place that answers 503 instead. */
export function rethrowIfUnavailable(error: unknown): void {
  if (unavailablePartOf(error) !== undefined) throw error;
}
