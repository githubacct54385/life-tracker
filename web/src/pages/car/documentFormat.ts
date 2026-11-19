import type { MaintenanceDocument } from "@life-tracker/shared";

/** A size for people: "850 KB", "5.2 MB", "36.0 MB". Never "0 KB". */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const isPdf = (document: Pick<MaintenanceDocument, "contentType">) => document.contentType === "application/pdf";

/** "Photo" or "PDF". Documents have no file names (they are never kept), so this and a number are all there is to call one. */
export const kindOf = (document: Pick<MaintenanceDocument, "contentType">) => (isPdf(document) ? "PDF" : "Photo");

export const totalBytes = (documents: readonly Pick<MaintenanceDocument, "bytes">[]) => documents.reduce((sum, d) => sum + d.bytes, 0);
