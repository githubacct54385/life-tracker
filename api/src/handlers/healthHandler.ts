import { Hono } from "hono";
import type { AvailabilityResponse } from "@life-tracker/shared";
import { healthStatus } from "../health.js";
import { errorCodeOf, errorTypeOf, type Logger } from "../telemetry/logger.js";

export interface HealthDeps {
  logger: Logger;
  /** From the service layer. Handlers never reach the database themselves. */
  checkDatabase: () => Promise<boolean>;
  /** Without it the documents part is reported as ok (a deployment with no document store has nothing to be down). */
  documents?: { reachable(): Promise<boolean> };
}

/** Routes under /api/health. Neither route returns data, only a status word. */
export function healthRoutes({ logger, checkDatabase, documents }: HealthDeps): Hono {
  const routes = new Hono();

  // Does not touch the database, so it is safe to call as often as needed.
  routes.get("/", (c) => c.json(healthStatus()));

  // Wakes the database if it is suspended. For setup checks, not for monitoring.
  // On failure it adds the short error code (a Postgres or Node code, never a message), so a setup mistake can be told apart.
  routes.get("/db", async (c) => {
    let errorCode: string | undefined;
    try {
      if (await checkDatabase()) return c.json(healthStatus());
    } catch (error) {
      errorCode = errorCodeOf(error);
      logger.error("health.db_failed", { errorType: errorTypeOf(error), errorCode });
    }
    return c.json(errorCode ? { status: "unavailable", errorCode } : { status: "unavailable" }, 503);
  });

  // OPS-14: one word for each part the Worker depends on, so the app can tell the person which one is down, and notice when it is back.
  // Reaching this route means the sign-in check worked (it runs first), so that part is always ok here. No data and no error text is returned.
  routes.get("/parts", async (c) => {
    const database = await checkDatabase().then((ok) => ok, () => false);
    const stored = documents ? await documents.reachable().then((ok) => ok, () => false) : true;
    const parts: AvailabilityResponse = { database: database ? "ok" : "unavailable", documents: stored ? "ok" : "unavailable", signIn: "ok" };
    for (const part of ["database", "documents"] as const) if (parts[part] === "unavailable") logger.warn("health.part_unavailable", { part });
    return c.json(parts);
  });

  return routes;
}
