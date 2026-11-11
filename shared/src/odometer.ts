import { z } from "zod";

// Request and response shapes for the odometer endpoints (MIL-01). Used by the API client, the demo API and the Worker.

/** The largest reading the database accepts (seven digits). */
export const MAX_ODOMETER_MILES = 9_999_999;

const milesSchema = z.number().int().min(0).max(MAX_ODOMETER_MILES);

export const odometerReadingSchema = z.object({
  id: z.number().int().positive(),
  /** Calendar date, "YYYY-MM-DD". Set by the server when the reading is saved. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  miles: milesSchema,
});
export type OdometerReadingRecord = z.infer<typeof odometerReadingSchema>;

const checkedReadingSchema = z.object({ date: z.string(), miles: z.number() });

export const readingWarningSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lower_than_previous"), previous: checkedReadingSchema }),
  z.object({ kind: z.literal("higher_than_next"), next: checkedReadingSchema }),
  z.object({ kind: z.literal("implausible_jump"), miles: z.number(), days: z.number() }),
]);

/** Body of POST /api/odometer and PUT /api/odometer/:id. There is deliberately no date field. */
export const saveReadingRequestSchema = z
  .object({
    miles: milesSchema,
    /** True once the owner has seen the warnings and chose to save anyway. */
    confirmed: z.boolean().optional(),
  })
  .strict();
export type SaveReadingRequest = z.infer<typeof saveReadingRequestSchema>;

export const readingListResponseSchema = z.object({ readings: z.array(odometerReadingSchema) });
export type ReadingListResponse = z.infer<typeof readingListResponseSchema>;

/** The answer to a save: either it was saved, or warnings need confirming first (HTTP 409 from the API). */
export const saveReadingResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("saved"), reading: odometerReadingSchema }),
  z.object({ status: z.literal("needs_confirmation"), warnings: z.array(readingWarningSchema).min(1) }),
]);
export type SaveReadingResult = z.infer<typeof saveReadingResultSchema>;
