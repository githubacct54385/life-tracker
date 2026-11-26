import { z } from "zod";

// What the app says when a part it depends on is not available (OPS-14). Plain words only: never an error message, a host name or a key.

/** The parts the Worker depends on, in the words used in code. `signIn` is the check of Cloudflare Access's public keys. */
export const DEPENDENCY_PARTS = ["database", "documents", "signIn"] as const;
export type DependencyPart = (typeof DEPENDENCY_PARTS)[number];

const partSchema = z.enum(DEPENDENCY_PARTS);

/** The answer to any request that cannot be served because a part is down (status 503). It names the part and nothing else (AC-OPS-14.1). */
export const unavailableResponseSchema = z.object({ error: z.literal("unavailable"), part: partSchema }).strict();
export type UnavailableResponse = z.infer<typeof unavailableResponseSchema>;

const statusSchema = z.enum(["ok", "unavailable"]);

/** GET /api/health/parts: one word for each part. Never data and never an error message. */
export const availabilityResponseSchema = z.object({ database: statusSchema, documents: statusSchema, signIn: statusSchema }).strict();
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

/** The parts that are not available, in a fixed order. */
export const unavailableParts = (availability: AvailabilityResponse): DependencyPart[] => DEPENDENCY_PARTS.filter((part) => availability[part] === "unavailable");

const SENTENCES: Record<DependencyPart, string> = {
  database: "The database is not available right now.",
  documents: "Documents are not available right now.",
  signIn: "The sign-in check is not available right now.",
};

/** One short sentence for a part, for the place on a page where it would have been. */
export const unavailableSentence = (part: DependencyPart): string => SENTENCES[part];

/** The banner text for the parts that are down. Empty when none is. */
export function unavailableBanner(parts: readonly DependencyPart[]): string {
  if (parts.length === 0) return "";
  return `${DEPENDENCY_PARTS.filter((part) => parts.includes(part)).map(unavailableSentence).join(" ")} Please try again in a few minutes. Your saved data is safe.`;
}
