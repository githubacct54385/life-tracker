import { z } from "zod";

// Request and response shapes for the weight endpoints (HLT-01). Used by the API client, the demo API and the Worker.
// Named weightLog (not weight) because weight.ts holds the pure trend and unit maths.

/** The range the database accepts, in pounds. */
export const MIN_WEIGHT_POUNDS = 20;
export const MAX_WEIGHT_POUNDS = 1500;

/** Pounds to 0.1, as stored. The screen converts from kilograms before sending (AC-HLT-01.4). */
const poundsSchema = z
  .number()
  .min(MIN_WEIGHT_POUNDS)
  .max(MAX_WEIGHT_POUNDS)
  .refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-6, "At most one decimal place");

export const weightEntrySchema = z.object({
  id: z.number().int().positive(),
  /** Calendar date, "YYYY-MM-DD". Set by the server when the entry is saved (AC-HLT-01.1). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pounds: poundsSchema,
});
export type WeightEntryRecord = z.infer<typeof weightEntrySchema>;

/** Body of POST /api/weight. There is deliberately no date field (AC-HLT-01.1). `replace` confirms replacing today's entry (AC-HLT-01.3). */
export const saveWeightRequestSchema = z.object({ pounds: poundsSchema, replace: z.boolean().optional() }).strict();
export type SaveWeightRequest = z.infer<typeof saveWeightRequestSchema>;

/** Body of PUT /api/weight/:id: changes the value and keeps the date. */
export const editWeightRequestSchema = z.object({ pounds: poundsSchema }).strict();
export type EditWeightRequest = z.infer<typeof editWeightRequestSchema>;

export const weightListResponseSchema = z.object({ entries: z.array(weightEntrySchema) });
export type WeightListResponse = z.infer<typeof weightListResponseSchema>;

/** Saved, or "needs_replace" with today's existing entry when one is already there (answered 409). */
export const saveWeightResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("saved"), entry: weightEntrySchema }),
  z.object({ status: z.literal("needs_replace"), existing: weightEntrySchema }),
]);
export type SaveWeightResult = z.infer<typeof saveWeightResultSchema>;
