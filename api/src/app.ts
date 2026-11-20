// The API as a Hono app. Pure Request in, Response out: no Cloudflare imports, so it runs under plain Node in tests.
// Order of work for every /api request: log it, check the custom header, then route to a handler (ARCHITECTURE.md).
import { Hono } from "hono";
import { authenticate, remoteKeys, type KeySource } from "./auth/accessGuard.js";
import type { AccessSettings } from "./auth/accessConfig.js";
import { requestGuard } from "./auth/requestGuard.js";
import type { PeopleService } from "./services/peopleService.js";
import { healthRoutes } from "./handlers/healthHandler.js";
import { giftRoutes } from "./handlers/giftHandler.js";
import { odometerRoutes } from "./handlers/odometerHandler.js";
import type { GiftService } from "./services/giftService.js";
import { maintenanceRoutes } from "./handlers/maintenanceHandler.js";
import { weightRoutes } from "./handlers/weightHandler.js";
import { workoutRoutes } from "./handlers/workoutHandler.js";
import type { OdometerService } from "./services/odometerService.js";
import type { DocumentService } from "./services/documentService.js";
import type { MaintenanceService } from "./services/maintenanceService.js";
import type { WeightService } from "./services/weightService.js";
import type { WorkoutService } from "./services/workoutService.js";
import { errorCodeOf, errorTypeOf, type Logger } from "./telemetry/logger.js";

export interface AppDeps {
  logger: Logger;
  checkDatabase: () => Promise<boolean>;
  odometer: OdometerService;
  gifts: GiftService;
  workouts: WorkoutService;
  weight: WeightService;
  maintenance: MaintenanceService;
  /** Documents attached to car services (MIL-07). Without it the document routes answer 404. */
  documents?: DocumentService;
  /** Who is making the request, and the scope that limits every query to that person (SET-04). */
  people: PeopleService;
  /** Where to get Access's public keys. Defaults to the published ones; tests pass their own. */
  keys?: KeySource;
}

/** Route pattern as a log label: "/api/health" -> "api/health". Never the real URL, which could carry data. */
function routeLabel(routePath: string, matched: boolean): string {
  if (!matched) return "unmatched";
  return routePath.replace(/^\//, "").replace(/:/g, "_").toLowerCase() || "unmatched";
}

export function createApp(deps: AppDeps): Hono<{ Bindings: AccessSettings }> {
  const app = new Hono<{ Bindings: AccessSettings }>().basePath("/api");

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

  // AC-MIG-04.2/04.3: identity first, for every route and every method, before anything else can answer.
  // An unknown path gets the same 401 as a known one, so a caller who is not the owner learns nothing.
  app.use("*", async (c, next) => {
    const result = await authenticate(c.req.raw.headers, c.env ?? {}, deps.keys ?? remoteKeys);
    if (!result.ok) return c.json({ error: result.status === 401 ? "unauthorized" : "forbidden" }, result.status);
    // The smoke-test identity (ADR-0023) can look but never change anything.
    if (result.readOnly && c.req.method !== "GET" && c.req.method !== "HEAD") return c.json({ error: "forbidden" }, 403);
    // SET-04: from here on the request is for one person, and every query sees only that person's rows. A person who is
    // not active gets nothing. Health checks read no person's data, so they skip this step (and keep answering when the database is down).
    if (c.req.path.startsWith("/api/health")) return next();
    const person = await deps.people.ensureOwner(result.email);
    if (person.status !== "active") return c.json({ error: "forbidden" }, 403);
    await deps.people.runAs(person.id, next);
  });

  // AC-MIG-03.3: the same check as before, on every method. Safe methods pass; anything else needs the custom header.
  app.use("*", async (c, next) => {
    const headers = Object.fromEntries(c.req.raw.headers.entries());
    const result = requestGuard(c.req.method, headers);
    if (!result.ok) return c.json({ error: "forbidden" }, result.status);
    await next();
  });

  app.route("/health", healthRoutes(deps));
  app.route("/odometer", odometerRoutes(deps));
  app.route("/gifts", giftRoutes(deps));
  app.route("/workouts", workoutRoutes(deps));
  app.route("/weight", weightRoutes(deps));
  app.route("/maintenance", maintenanceRoutes(deps));

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((error, c) => {
    deps.logger.error("api.unhandled_error", { errorType: errorTypeOf(error), errorCode: errorCodeOf(error) });
    return c.json({ error: "internal" }, 500);
  });

  return app;
}
