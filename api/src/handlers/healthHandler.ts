import { Hono } from "hono";
import { healthStatus } from "../health.js";
import { errorCodeOf, errorTypeOf, type Logger } from "../telemetry/logger.js";

export interface HealthDeps {
  logger: Logger;
  /** From the service layer. Handlers never reach the database themselves. */
  checkDatabase: () => Promise<boolean>;
}

/** Routes under /api/health. Neither route returns data, only a status word. */
export function healthRoutes({ logger, checkDatabase }: HealthDeps): Hono {
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

  return routes;
}
