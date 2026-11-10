// The API as a Hono app. Pure Request in, Response out: no Cloudflare imports, so it runs under plain Node in tests.
// Order of work for every /api request: log it, check the custom header, then route to a handler (ARCHITECTURE.md).
import { Hono } from "hono";
import { requestGuard } from "./auth/requestGuard.js";
import { healthRoutes } from "./handlers/healthHandler.js";
import { errorTypeOf, type Logger } from "./telemetry/logger.js";

export interface AppDeps {
  logger: Logger;
  checkDatabase: () => Promise<boolean>;
}

/** Route pattern as a log label: "/api/health" -> "api/health". Never the real URL, which could carry data. */
function routeLabel(routePath: string, matched: boolean): string {
  if (!matched) return "unmatched";
  return routePath.replace(/^\//, "").replace(/:/g, "_").toLowerCase() || "unmatched";
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono().basePath("/api");

  app.use("*", async (c, next) => {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    await next();
    const matched = c.req.routePath !== "/api/*" && c.req.routePath !== "*";
    deps.logger.info("api.request", {
      requestId,
      route: routeLabel(c.req.routePath, matched),
      statusCode: c.res.status,
      durationMs: Math.max(0, Date.now() - started),
    });
  });

  // AC-MIG-03.3: the same check as before, on every method. Safe methods pass; anything else needs the custom header.
  app.use("*", async (c, next) => {
    const headers = Object.fromEntries(c.req.raw.headers.entries());
    const result = requestGuard(c.req.method, headers);
    if (!result.ok) return c.json({ error: "forbidden" }, result.status);
    await next();
  });

  app.route("/health", healthRoutes(deps));

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((error, c) => {
    deps.logger.error("api.unhandled_error", { errorType: errorTypeOf(error) });
    return c.json({ error: "internal" }, 500);
  });

  return app;
}
