import { Hono } from "hono";
import { healthStatus } from "../health.js";
import { errorTypeOf, type Logger } from "../telemetry/logger.js";

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
  routes.get("/db", async (c) => {
    try {
      if (await checkDatabase()) return c.json(healthStatus());
    } catch (error) {
      logger.error("health.db_failed", { errorType: errorTypeOf(error) });
    }
    return c.json({ status: "unavailable" }, 503);
  });

  return routes;
}
