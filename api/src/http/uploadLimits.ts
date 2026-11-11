// Server-side size and type limits for upload endpoints (AC-SET-03.2, hard rule 5: files are parsed, never stored).
// Every endpoint that accepts a file calls `readUpload` with its own policy before parsing anything.

export interface UploadPolicy {
  /** Largest body accepted, in bytes. */
  maxBytes: number;
  /** Accepted Content-Type values, without parameters. */
  contentTypes: readonly string[];
  /** The file must start with one of these byte sequences (so a renamed file of another type is refused). */
  signatures: readonly (readonly number[])[];
}

export type UploadResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; status: 411 | 413 | 415; error: "length_required" | "too_large" | "unsupported_type" };

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

/** Excel workbooks (.xlsx) are zip files. The mileage import (MIL-04) uses this policy. */
export const SPREADSHEET_UPLOAD: UploadPolicy = {
  maxBytes: 5 * 1024 * 1024,
  contentTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"],
  signatures: [ZIP_SIGNATURE],
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
  if (!policy.signatures.some((s) => startsWith(bytes, s))) return { ok: false, status: 415, error: "unsupported_type" };
  return { ok: true, bytes };
}
