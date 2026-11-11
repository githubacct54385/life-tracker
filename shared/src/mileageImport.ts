import { z } from "zod";
import { MAX_ODOMETER_MILES } from "./odometer.js";
import { weeklyMiles, type OdometerReading } from "./mileage.js";

// Spreadsheet import of mileage history (MIL-04). The file is read in the browser; only these validated rows reach the API (ADR-0009).

/** The most rows one import may carry. A weekly log would need about a century to reach it. */
export const MAX_IMPORT_ROWS = 5000;

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number) as [number, number, number];
    const check = new Date(Date.UTC(y, m - 1, d));
    return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
  }, "Not a calendar date");

/** One reading to import: the sheet's Date and Start Miles. Miles driven is never sent; the server does not use it. */
export const importRowSchema = z.object({ date: calendarDate, miles: z.number().int().min(0).max(MAX_ODOMETER_MILES) }).strict();
export type ImportRow = z.infer<typeof importRowSchema>;

/** Body of POST /api/odometer/import. The server validates every row again (hard rules: never trust the browser). */
export const importMileageRequestSchema = z.object({ rows: z.array(importRowSchema).min(1).max(MAX_IMPORT_ROWS) }).strict();
export type ImportMileageRequest = z.infer<typeof importMileageRequestSchema>;

export const importMileageResultSchema = z.object({
  /** Readings added. */
  imported: z.number().int().min(0),
  /** Rows skipped because a reading with the same date and miles already existed (or repeated in the file). */
  duplicates: z.number().int().min(0),
});
export type ImportMileageResult = z.infer<typeof importMileageResultSchema>;

/**
 * Miles driven for each start reading, keyed by its date: the next check-in's reading minus this one (the sheet's
 * "Miles Driven" on a Friday row is the week that starts there). The last reading has none. Recalculated, never read
 * from the file (AC-MIL-04.2), using the same weekly rules as the graphs (`weeklyMiles`).
 */
export function recalculateMilesDriven(rows: readonly OdometerReading[]): Map<string, number> {
  return new Map(weeklyMiles(rows).map((period) => [period.from, period.miles]));
}

export interface ImportCandidate {
  /** Row number in the file, for messages. */
  rowNumber: number;
  date: string;
  miles: number;
  /** The sheet's own Miles Driven cell, when it has one. Used only to compare. */
  sheetMilesDriven?: number | undefined;
}

export interface ImportPreviewRow extends ImportCandidate {
  /** Recalculated; undefined for the last reading. */
  milesDriven: number | undefined;
  /** True when the sheet had a value and it differs from the recalculated one (AC-MIL-04.3). */
  flagged: boolean;
}

export function previewImportRows(rows: readonly ImportCandidate[]): ImportPreviewRow[] {
  const recalculated = recalculateMilesDriven(rows);
  return rows.map((row) => {
    const milesDriven = recalculated.get(row.date);
    return { ...row, milesDriven, flagged: milesDriven !== undefined && row.sheetMilesDriven !== undefined && row.sheetMilesDriven !== milesDriven };
  });
}
