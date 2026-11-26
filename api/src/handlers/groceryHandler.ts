import { Hono } from "hono";
import { addGroceryRequestSchema, editGroceryRequestSchema, groceryItemSchema, groceryListResponseSchema } from "@life-tracker/shared";
import type { GroceryService } from "../services/groceryService.js";
import { errorTypeOf, type Logger } from "../telemetry/logger.js";
import { rethrowIfUnavailable } from "../http/unavailable.js";

export interface GroceryDeps {
  logger: Logger;
  groceries: GroceryService;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const parseId = (raw: string): string | undefined => (UUID.test(raw) ? raw.toLowerCase() : undefined);

/**
 * Routes under /api/groceries (GRO-01). The person has already been confirmed by the app's middleware, and every query sees only their rows.
 * Adding is safe to repeat: the client chooses the item's id, and the same id again answers 200 with the item that is already there.
 */
export function groceryRoutes({ logger, groceries }: GroceryDeps): Hono {
  const routes = new Hono();

  routes.get("/", async (c) => {
    const items = await groceries.list();
    logger.info("groceries.list", { rowCount: items.length });
    return c.json(groceryListResponseSchema.parse({ items }));
  });

  routes.post("/", async (c) => {
    const body = addGroceryRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    const outcome = await groceries.add({ ...body.data, id: body.data.id.toLowerCase() });
    if (outcome.status === "list_full") return c.json({ error: "list_full" }, 409);
    return c.json(groceryItemSchema.parse(outcome.item), outcome.status === "added" ? 201 : 200);
  });

  // Finish trip and clear list: one call, the person's whole list (AC-GRO-01.5).
  routes.delete("/", async (c) => {
    try {
      const removed = await groceries.clear();
      logger.info("groceries.cleared", { rowCount: removed });
      return c.body(null, 204);
    } catch (error) {
      rethrowIfUnavailable(error);
      logger.error("groceries.clear_failed", { errorType: errorTypeOf(error) });
      return c.json({ error: "internal" }, 500);
    }
  });

  routes.put("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const body = editGroceryRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (id === undefined || !body.success) return c.json({ error: "invalid_request" }, 400);
    const item = await groceries.edit(id, body.data);
    return item ? c.json(groceryItemSchema.parse(item)) : c.json({ error: "not_found" }, 404);
  });

  routes.delete("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === undefined) return c.json({ error: "invalid_request" }, 400);
    return (await groceries.remove(id)) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
  });

  return routes;
}
