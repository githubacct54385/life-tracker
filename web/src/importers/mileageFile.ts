import { readSheet } from "read-excel-file/universal";
import { parseCsv, parseMileageGrid, type Grid, type ParsedSheet } from "./mileageGrid";

// Reads the owner's .xlsx or CSV in the browser (ADR-0009). The file is read into memory, parsed and dropped: it is never
// uploaded or stored (AC-MIL-04.5, hard rule 5). Only the parsed rows leave this module.

/** Limits from ADR-0016: 5 MB for the file, and a cap on uncompressed size because an .xlsx is a zip file. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

export type ReadOutcome = ParsedSheet | { problem: "too_big" | "unsupported_file" | "unreadable"; rows: []; errors: [] };

const fail = (problem: "too_big" | "unsupported_file" | "unreadable"): ReadOutcome => ({ problem, rows: [], errors: [] });

/** Total uncompressed size the zip's central directory declares, or undefined when it is not a readable zip. */
export function declaredUncompressedBytes(zip: ArrayBuffer): number | undefined {
  const view = new DataView(zip);
  let end = view.byteLength - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--; // end-of-central-directory record
  if (end < 0) return undefined;
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== 0x02014b50) return undefined;
    total += view.getUint32(offset + 24, true);
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return total;
}

export async function readMileageFile(file: Blob & { name?: string }): Promise<ReadOutcome> {
  if (file.size > MAX_FILE_BYTES) return fail("too_big");
  const name = (file.name ?? "").toLowerCase();
  try {
    if (name.endsWith(".csv")) return parseMileageGrid(parseCsv(await file.text()));
    if (name.endsWith(".xlsx")) {
      const bytes = await file.arrayBuffer();
      const declared = declaredUncompressedBytes(bytes);
      if (declared === undefined) return fail("unreadable");
      if (declared > MAX_UNCOMPRESSED_BYTES) return fail("too_big");
      // readSheet gives the rows of the first sheet.
      return parseMileageGrid((await readSheet(new Blob([bytes]))) as Grid);
    }
    return fail("unsupported_file");
  } catch {
    return fail("unreadable");
  }
}
