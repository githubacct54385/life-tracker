// Server-side size and type limits for endpoints that take an upload (AC-SET-03.2, hard rule 5: files are never stored).
// Every such endpoint calls `readUpload` with its own policy before parsing anything. The spreadsheet itself is read in
// the browser (ADR-0009), so the mileage import endpoint receives validated JSON rows and uses IMPORT_JSON_UPLOAD.

export interface UploadPolicy {
  /** Largest body accepted, in bytes. */
  maxBytes: number;
  /** Accepted Content-Type values, without parameters. */
  contentTypes: readonly string[];
  /** The body must start with one of these byte sequences (so a renamed file of another type is refused). Empty means no check. */
  signatures: readonly (readonly number[])[];
}

export type UploadResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; status: 411 | 413 | 415; error: "length_required" | "too_large" | "unsupported_type" };

/**
 * The mileage import (MIL-04): a JSON body of parsed rows. The most rows allowed is 5,000 (MAX_IMPORT_ROWS), about 200 KB
 * of JSON, so 512 KB leaves room for formatting and nothing larger is ever read.
 */
export const IMPORT_JSON_UPLOAD: UploadPolicy = {
  maxBytes: 512 * 1024,
  contentTypes: ["application/json"],
  signatures: [],
};

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.length >= signature.length && signature.every((b, i) => bytes[i] === b);
}

/**
 * Reads the request body with the policy applied. The declared Content-Length is checked first so an oversized file is
 * refused without reading it, and the real byte count is enforced while streaming because the header can lie or be absent.
 */
export async function readUpload(request: Request, policy: UploadPolicy): Promise<UploadResult> {
  const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!policy.contentTypes.includes(type)) return { ok: false, status: 415, error: "unsupported_type" };

  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (!Number.isInteger(n) || n < 0) return { ok: false, status: 411, error: "length_required" };
    if (n > policy.maxBytes) return { ok: false, status: 413, error: "too_large" };
  }
  if (!request.body) return { ok: false, status: 415, error: "unsupported_type" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > policy.maxBytes) {
      await reader.cancel();
      return { ok: false, status: 413, error: "too_large" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (policy.signatures.length > 0 && !policy.signatures.some((s) => startsWith(bytes, s))) return { ok: false, status: 415, error: "unsupported_type" };
  return { ok: true, bytes };
}
