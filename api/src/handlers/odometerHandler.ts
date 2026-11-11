import { Hono } from "hono";
import { importMileageRequestSchema, importMileageResultSchema, readingListResponseSchema, saveReadingRequestSchema, saveReadingResultSchema } from "@life-tracker/shared";
import { IMPORT_JSON_UPLOAD, readUpload } from "../http/uploadLimits.js";
import type { OdometerService, SaveOutcome } from "../services/odometerService.js";
import { errorTypeOf, type Logger } from "../telemetry/logger.js";

export interface OdometerDeps {
  logger: Logger;
  odometer: OdometerService;
}

const parseId = (raw: string): number | undefined => (/^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : undefined);

/**
 * Routes under /api/odometer. The owner has already been checked by the app's middleware (every route, every method).
 * A reading that needs confirming answers 409 with the warnings; the screen asks, then sends the same request with `confirmed: true`.
 */
export function odometerRoutes({ logger, odometer }: OdometerDeps): Hono {
  const routes = new Hono();

  const respond = (c: { json: (body: unknown, status?: 200 | 201 | 404 | 409) => Response }, outcome: SaveOutcome, created: boolean) => {
    if (outcome.status === "not_found") return c.json({ error: "not_found" }, 404);
    const body = saveReadingResultSchema.parse(outcome);
    return c.json(body, outcome.status === "saved" ? (created ? 201 : 200) : 409);
  };

  routes.get("/", async (c) => {
    // `?all=1` returns the whole history for the stats screen (MIL-03); otherwise the latest 30.
    const readings = await odometer.list(c.req.query("all") === "1" ? Number.MAX_SAFE_INTEGER : undefined);
    logger.info("odometer.list", { rowCount: readings.length });
    return c.json(readingListResponseSchema.parse({ readings }));
  });

  routes.post("/", async (c) => {
    const body = saveReadingRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    return respond(c, await odometer.log(body.data.miles, body.data.confirmed === true), true);
  });

  // MIL-04: rows the browser parsed from the owner's spreadsheet. The file itself never arrives and is never stored (AC-MIL-04.5).
  // The size and type limits are checked before the body is parsed (AC-SET-03.2), so an oversized or wrongly typed body is never read in full.
  routes.post("/import", async (c) => {
    const upload = await readUpload(c.req.raw, IMPORT_JSON_UPLOAD);
    if (!upload.ok) return c.json({ error: upload.error }, upload.status);
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(upload.bytes));
    } catch {
      json = undefined;
    }
    const body = importMileageRequestSchema.safeParse(json);
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    const result = await odometer.importReadings(body.data.rows);
    logger.info("odometer.import", { rowCount: body.data.rows.length });
    return c.json(importMileageResultSchema.parse(result));
  });

  routes.put("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const body = saveReadingRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (id === undefined || !body.success) return c.json({ error: "invalid_request" }, 400);
    return respond(c, await odometer.edit(id, body.data.miles, body.data.confirmed === true), false);
  });

  routes.delete("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === undefined) return c.json({ error: "invalid_request" }, 400);
    try {
      return (await odometer.remove(id)) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
    } catch (error) {
      logger.error("odometer.delete_failed", { errorType: errorTypeOf(error) });
      return c.json({ error: "internal" }, 500);
    }
  });

  return routes;
}
