import { Hono } from "hono";
import { giftListResponseSchema, giftSchema, saveGiftRequestSchema } from "@life-tracker/shared";
import type { GiftService } from "../services/giftService.js";
import { errorTypeOf, type Logger } from "../telemetry/logger.js";

export interface GiftDeps {
  logger: Logger;
  gifts: GiftService;
}

const parseId = (raw: string): number | undefined => (/^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : undefined);

/** Routes under /api/gifts. The owner has already been checked by the app's middleware (every route, every method). */
export function giftRoutes({ logger, gifts }: GiftDeps): Hono {
  const routes = new Hono();
  const readBody = async (c: { req: { json: () => Promise<unknown> } }) => saveGiftRequestSchema.safeParse(await c.req.json().catch(() => undefined));

  routes.get("/", async (c) => {
    const list = await gifts.list();
    logger.info("gifts.list", { rowCount: list.length });
    return c.json(giftListResponseSchema.parse({ gifts: list }));
  });

  routes.post("/", async (c) => {
    const body = await readBody(c);
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    return c.json(giftSchema.parse(await gifts.create(body.data)), 201);
  });

  routes.put("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const body = await readBody(c);
    if (id === undefined || !body.success) return c.json({ error: "invalid_request" }, 400);
    const gift = await gifts.edit(id, body.data);
    return gift ? c.json(giftSchema.parse(gift)) : c.json({ error: "not_found" }, 404);
  });

  routes.delete("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === undefined) return c.json({ error: "invalid_request" }, 400);
    try {
      return (await gifts.remove(id)) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
    } catch (error) {
      logger.error("gifts.delete_failed", { errorType: errorTypeOf(error) });
      return c.json({ error: "internal" }, 500);
    }
  });

  return routes;
}
