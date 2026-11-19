import { z } from "zod";

// Documents attached to a car service (MIL-07, ADR-0024): shapes, limits and the file-type check. Used by the API, the client and the demo.

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_RECORD = 10;
export const DOCUMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) => bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/**
 * The type of a file, read from its own first bytes. The file name and the type the browser claims are never consulted,
 * so a renamed file of another type is refused (AC-MIL-07.3). Undefined when the bytes are none of the four allowed types.
 */
export function sniffDocumentType(bytes: Uint8Array): DocumentType | undefined {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  // PDF readers accept the header a little way into the file; a few bytes of slack matches them.
  const head = bytes.subarray(0, 1024);
  for (let i = 0; i + 5 <= head.length; i += 1) if (startsWith(head, ascii("%PDF-"), i)) return "application/pdf";
  return undefined;
}

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

/** What the owner sees of a stored document. There is no file name (it is never kept) and no storage key (it never leaves the server). */
export const maintenanceDocumentSchema = z.object({
  id: z.number().int().positive(),
  recordId: z.number().int().positive(),
  contentType: documentTypeSchema,
  bytes: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
  /** When it was added, ISO 8601. */
  createdAt: z.string().min(1),
});
export type MaintenanceDocument = z.infer<typeof maintenanceDocumentSchema>;

export const documentListResponseSchema = z.object({ documents: z.array(maintenanceDocumentSchema) });
export type DocumentListResponse = z.infer<typeof documentListResponseSchema>;
