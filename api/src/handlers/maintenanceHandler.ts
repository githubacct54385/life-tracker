import { Hono } from "hono";
import { TIME_ZONE_HEADER, maintenanceListResponseSchema, maintenanceRecordSchema, placeListResponseSchema, renamePlaceRequestSchema, saveMaintenanceRequestSchema, servicePlaceSchema } from "@life-tracker/shared";
import type { MaintenanceService } from "../services/maintenanceService.js";
import { errorTypeOf, type Logger } from "../telemetry/logger.js";

export interface MaintenanceDeps {
  logger: Logger;
  maintenance: MaintenanceService;
}

const parseId = (raw: string): number | undefined => (/^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : undefined);

/**
 * Routes under /api/maintenance. The owner has already been checked by the app's middleware (every route, every method).
 * `/places` is registered before `/:id` so it is never read as an id.
 */
export function maintenanceRoutes({ logger, maintenance }: MaintenanceDeps): Hono {
  const routes = new Hono();

  routes.get("/places", async (c) => {
    const places = await maintenance.places();
    logger.info("maintenance.places", { rowCount: places.length });
    return c.json(placeListResponseSchema.parse({ places }));
  });

  routes.put("/places/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const body = renamePlaceRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (id === undefined || !body.success) return c.json({ error: "invalid_request" }, 400);
    const outcome = await maintenance.renamePlace(id, body.data.name);
    if (outcome.status === "not_found") return c.json({ error: "not_found" }, 404);
    if (outcome.status === "name_taken") return c.json({ error: "name_taken" }, 409);
    return c.json(servicePlaceSchema.parse(outcome.place));
  });

  routes.delete("/places/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === undefined) return c.json({ error: "invalid_request" }, 400);
    const outcome = await maintenance.deletePlace(id);
    if (outcome === "not_found") return c.json({ error: "not_found" }, 404);
    if (outcome === "in_use") return c.json({ error: "in_use" }, 409);
    return c.body(null, 204);
  });

  routes.get("/", async (c) => {
    const records = await maintenance.list();
    logger.info("maintenance.list", { rowCount: records.length });
    return c.json(maintenanceListResponseSchema.parse({ records }));
  });

  routes.post("/", async (c) => {
    const body = saveMaintenanceRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    const outcome = await maintenance.log(body.data, c.req.header(TIME_ZONE_HEADER));
    if (outcome.status === "future_date") return c.json({ error: "future_date" }, 400);
    return outcome.status === "saved" ? c.json(maintenanceRecordSchema.parse(outcome.record), 201) : c.json({ error: "internal" }, 500);
  });

  routes.put("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const body = saveMaintenanceRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (id === undefined || !body.success) return c.json({ error: "invalid_request" }, 400);
    const outcome = await maintenance.edit(id, body.data, c.req.header(TIME_ZONE_HEADER));
    if (outcome.status === "future_date") return c.json({ error: "future_date" }, 400);
    if (outcome.status === "not_found") return c.json({ error: "not_found" }, 404);
    return c.json(maintenanceRecordSchema.parse(outcome.record));
  });

  routes.delete("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === undefined) return c.json({ error: "invalid_request" }, 400);
    try {
      return (await maintenance.remove(id)) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
    } catch (error) {
      logger.error("maintenance.delete_failed", { errorType: errorTypeOf(error) });
      return c.json({ error: "internal" }, 500);
    }
  });

  return routes;
}
