import { Hono } from "hono";
import {
  giftListResponseSchema,
  giftSchema,
  saveGiftRequestSchema,
  saveSpecialContributionRequestSchema,
  specialContributionListResponseSchema,
  specialContributionSchema,
} from "@life-tracker/shared";
import type { GiftService } from "../services/giftService.js";
import { errorTypeOf, type Logger } from "../telemetry/logger.js";
import { rethrowIfUnavailable } from "../http/unavailable.js";

export interface GiftDeps {
  logger: Logger;
  gifts: GiftService;
}

const parseId = (raw: string): number | undefined => (/^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : undefined);

/** Routes under /api/gifts. The owner has already been checked by the app's middleware (every route, every method). */
export function giftRoutes({ logger, gifts }: GiftDeps): Hono {
  const routes = new Hono();
  const readBody = async (c: { req: { json: () => Promise<unknown> } }) => saveGiftRequestSchema.safeParse(await c.req.json().catch(() => undefined));

  const readSpecialBody = async (c: { req: { json: () => Promise<unknown> } }) =>
    saveSpecialContributionRequestSchema.safeParse(await c.req.json().catch(() => undefined));

  // Special contributions (GIV-02). Registered first so "special" is never read as a gift id.
  routes.get("/special", async (c) => {
    const list = await gifts.listSpecial();
    logger.info("gifts.special_list", { rowCount: list.length });
    return c.json(specialContributionListResponseSchema.parse({ contributions: list }));
  });

  routes.post("/special", async (c) => {
    const body = await readSpecialBody(c);
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    return c.json(specialContributionSchema.parse(await gifts.createSpecial(body.data)), 201);
  });

  routes.put("/special/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const body = await readSpecialBody(c);
    if (id === undefined || !body.success) return c.json({ error: "invalid_request" }, 400);
    const saved = await gifts.editSpecial(id, body.data);
    return saved ? c.json(specialContributionSchema.parse(saved)) : c.json({ error: "not_found" }, 404);
  });

  routes.delete("/special/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === undefined) return c.json({ error: "invalid_request" }, 400);
    try {
      return (await gifts.removeSpecial(id)) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
    } catch (error) {
      rethrowIfUnavailable(error);
      logger.error("gifts.special_delete_failed", { errorType: errorTypeOf(error) });
      return c.json({ error: "internal" }, 500);
    }
  });

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
      rethrowIfUnavailable(error);
      logger.error("gifts.delete_failed", { errorType: errorTypeOf(error) });
      return c.json({ error: "internal" }, 500);
    }
  });

  return routes;
}
