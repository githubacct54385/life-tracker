import { Hono } from "hono";
import { TIME_ZONE_HEADER, editWeightRequestSchema, saveWeightRequestSchema, saveWeightResultSchema, weightEntrySchema, weightListResponseSchema } from "@life-tracker/shared";
import type { WeightService } from "../services/weightService.js";
import { errorTypeOf, type Logger } from "../telemetry/logger.js";

export interface WeightDeps {
  logger: Logger;
  weight: WeightService;
}

const parseId = (raw: string): number | undefined => (/^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : undefined);

/**
 * Routes under /api/weight. The owner has already been checked by the app's middleware (every route, every method).
 * A second entry for today answers 409 with the first; the screen asks, then sends the same request with `replace: true`.
 */
export function weightRoutes({ logger, weight }: WeightDeps): Hono {
  const routes = new Hono();

  routes.get("/", async (c) => {
    const entries = await weight.list();
    logger.info("weight.list", { rowCount: entries.length });
    return c.json(weightListResponseSchema.parse({ entries }));
  });

  routes.post("/", async (c) => {
    const body = saveWeightRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    const outcome = await weight.log(body.data.pounds, body.data.replace === true, c.req.header(TIME_ZONE_HEADER));
    return c.json(saveWeightResultSchema.parse(outcome), outcome.status === "saved" ? 201 : 409);
  });

  routes.put("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const body = editWeightRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (id === undefined || !body.success) return c.json({ error: "invalid_request" }, 400);
    const entry = await weight.edit(id, body.data.pounds);
    return entry ? c.json(weightEntrySchema.parse(entry)) : c.json({ error: "not_found" }, 404);
  });

  routes.delete("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === undefined) return c.json({ error: "invalid_request" }, 400);
    try {
      return (await weight.remove(id)) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
    } catch (error) {
      logger.error("weight.delete_failed", { errorType: errorTypeOf(error) });
      return c.json({ error: "internal" }, 500);
    }
  });

  return routes;
}
