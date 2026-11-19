import { z } from "zod";

// Request and response shapes for the car maintenance log (MIL-05). Used by the API client, the demo API and the Worker.

/** The services offered as ticks. The owner can also type their own. */
export const MAINTENANCE_TYPES = ["Oil change", "Tires", "Brakes", "Battery", "Air filter", "Wipers", "Alignment"] as const;
export const MAX_SERVICE_NAME_LENGTH = 40;
export const MAX_SERVICES_PER_RECORD = 8;
export const MAX_PLACE_NAME_LENGTH = 80;
export const MAX_MAINTENANCE_NOTE_LENGTH = 500;
export const MAX_MAINTENANCE_COST_CENTS = 100_000_000;
export const MAX_MAINTENANCE_ODOMETER = 9_999_999;

export const doneBySchema = z.enum(["shop", "home"]);
export type DoneBy = z.infer<typeof doneBySchema>;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }, "Not a calendar date");
const serviceNameSchema = z.string().trim().min(1).max(MAX_SERVICE_NAME_LENGTH);
const placeNameSchema = z.string().trim().min(1).max(MAX_PLACE_NAME_LENGTH);
const costSchema = z.number().int().min(0).max(MAX_MAINTENANCE_COST_CENTS);
const odometerSchema = z.number().int().min(0).max(MAX_MAINTENANCE_ODOMETER);

export const servicePlaceSchema = z.object({ id: z.number().int().positive(), name: placeNameSchema });
export type ServicePlace = z.infer<typeof servicePlaceSchema>;

export const maintenanceRecordSchema = z.object({
  id: z.number().int().positive(),
  /** Calendar date of the service, "YYYY-MM-DD". */
  date: dateSchema,
  services: z.array(serviceNameSchema).min(1).max(MAX_SERVICES_PER_RECORD),
  doneBy: doneBySchema,
  /** The shop, when the service was done at one and a place was named. Always null for a service done at home. */
  place: servicePlaceSchema.nullable(),
  costCents: costSchema.nullable(),
  odometerMiles: odometerSchema.nullable(),
  note: z.string().max(MAX_MAINTENANCE_NOTE_LENGTH).nullable(),
});
export type MaintenanceRecord = z.infer<typeof maintenanceRecordSchema>;

/**
 * Body of POST /api/maintenance and PUT /api/maintenance/:id. The place is sent by name: the server finds the one that
 * already has that name (ignoring letter case) or adds it. A service done at home has no place.
 */
export const saveMaintenanceRequestSchema = z
  .object({
    date: dateSchema,
    services: z.array(serviceNameSchema).min(1).max(MAX_SERVICES_PER_RECORD),
    doneBy: doneBySchema,
    placeName: placeNameSchema.optional(),
    costCents: costSchema.optional(),
    odometerMiles: odometerSchema.optional(),
    note: z.string().trim().max(MAX_MAINTENANCE_NOTE_LENGTH).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.doneBy === "home" && value.placeName !== undefined) ctx.addIssue({ code: "custom", message: "A service done at home has no place", path: ["placeName"] });
    const seen = new Set<string>();
    for (const name of value.services) {
      const key = name.trim().toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: "custom", message: "A service is listed twice", path: ["services"] });
      seen.add(key);
    }
  });
export type SaveMaintenanceRequest = z.infer<typeof saveMaintenanceRequestSchema>;

export const maintenanceListResponseSchema = z.object({ records: z.array(maintenanceRecordSchema) });
export type MaintenanceListResponse = z.infer<typeof maintenanceListResponseSchema>;
export const placeListResponseSchema = z.object({ places: z.array(servicePlaceSchema) });
export type PlaceListResponse = z.infer<typeof placeListResponseSchema>;

/** Body of PUT /api/maintenance/places/:id (MIL-06). */
export const renamePlaceRequestSchema = z.object({ name: placeNameSchema }).strict();
export type RenamePlaceRequest = z.infer<typeof renamePlaceRequestSchema>;
