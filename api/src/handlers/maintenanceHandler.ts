import { Hono } from "hono";
import { TIME_ZONE_HEADER, documentListResponseSchema, maintenanceDocumentSchema, maintenanceListResponseSchema, maintenanceRecordSchema, placeListResponseSchema, renamePlaceRequestSchema, saveMaintenanceRequestSchema, saveServiceIntervalRequestSchema, serviceIntervalListResponseSchema, serviceIntervalSchema, servicePlaceSchema } from "@life-tracker/shared";
import { DOCUMENT_UPLOAD, openUpload } from "../http/uploadLimits.js";
import type { DocumentService } from "../services/documentService.js";
import type { MaintenanceService } from "../services/maintenanceService.js";
import { errorTypeOf, type Logger } from "../telemetry/logger.js";

export interface MaintenanceDeps {
  logger: Logger;
  maintenance: MaintenanceService;
  documents?: DocumentService;
}

const parseId = (raw: string): number | undefined => (/^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : undefined);

/**
 * Routes under /api/maintenance. The owner has already been checked by the app's middleware (every route, every method).
 * `/places` is registered before `/:id` so it is never read as an id.
 */
export function maintenanceRoutes({ logger, maintenance, documents }: MaintenanceDeps): Hono {
  const routes = new Hono();

  // Documents (MIL-07). Registered before `/:id`. Only counts and status codes are logged, never a name, key, size or content (AC-MIL-07.7).
  routes.get("/documents", async (c) => {
    if (!documents) return c.json({ error: "not_found" }, 404);
    const list = await documents.list();
    logger.info("maintenance.documents", { rowCount: list.length });
    return c.json(documentListResponseSchema.parse({ documents: list }));
  });

  routes.get("/documents/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!documents || id === undefined) return c.json({ error: id === undefined ? "invalid_request" : "not_found" }, id === undefined ? 400 : 404);
    const found = await documents.read(id);
    if (found.status !== "found") return c.json({ error: "not_found" }, 404);
    // The stored type, never sniffed by the browser, and never kept by it or by a shared cache (AC-MIL-07.5).
    const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[found.contentType] ?? "bin";
    // A download gets a made-up name: the original name is never kept (AC-MIL-07.13).
    const disposition = c.req.query("download") === "1" ? `attachment; filename="life-tracker-document-${id}.${extension}"` : "inline";
    return new Response(found.body, {
      status: 200,
      headers: {
        "content-type": found.contentType,
        "content-length": String(found.size),
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
        "content-disposition": disposition,
      },
    });
  });

  routes.delete("/documents/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!documents || id === undefined) return c.json({ error: id === undefined ? "invalid_request" : "not_found" }, id === undefined ? 400 : 404);
    try {
      return (await documents.remove(id)) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
    } catch (error) {
      logger.error("maintenance.document_delete_failed", { errorType: errorTypeOf(error) });
      return c.json({ error: "internal" }, 500);
    }
  });

  routes.post("/:id/documents", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!documents || id === undefined) return c.json({ error: id === undefined ? "invalid_request" : "not_found" }, id === undefined ? 400 : 404);
    const upload = openUpload(c.req.raw, DOCUMENT_UPLOAD);
    if (!upload.ok) return c.json({ error: upload.error }, upload.status);
    const outcome = await documents.upload(id, upload.body, upload.length);
    switch (outcome.status) {
      case "saved":
        return c.json(maintenanceDocumentSchema.parse(outcome.document), 201);
      case "unsupported_type":
        return c.json({ error: "unsupported_type" }, 415);
      case "no_record":
        return c.json({ error: "not_found" }, 404);
      case "full":
        return c.json({ error: "limit_reached" }, 409);
      case "too_much":
        return c.json({ error: "too_much" }, 409);
      case "too_large":
        return c.json({ error: "too_large" }, 413);
      case "bad_length":
        return c.json({ error: "invalid_request" }, 400);
    }
  });

  // Service intervals (MIL-09). Registered before `/:id`.
  routes.get("/intervals", async (c) => {
    const intervals = await maintenance.intervals();
    logger.info("maintenance.intervals", { rowCount: intervals.length });
    return c.json(serviceIntervalListResponseSchema.parse({ intervals }));
  });

  routes.put("/intervals", async (c) => {
    const body = saveServiceIntervalRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    return c.json(serviceIntervalSchema.parse(await maintenance.setInterval(body.data)));
  });

  routes.delete("/intervals/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === undefined) return c.json({ error: "invalid_request" }, 400);
    return (await maintenance.removeInterval(id)) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
  });

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
