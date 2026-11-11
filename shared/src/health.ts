import { z } from "zod";

// Response of GET /api/health. Used by the API client and the demo API, so both return the same shape.
export const healthResponseSchema = z.object({ status: z.literal("ok") });
export type HealthResponse = z.infer<typeof healthResponseSchema>;
