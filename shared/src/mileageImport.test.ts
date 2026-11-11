import { describe, expect, it } from "vitest";
import { importMileageRequestSchema, MAX_IMPORT_ROWS, previewImportRows, recalculateMilesDriven } from "./mileageImport";

// All dates and values are invented. 2026-01-02 is a Friday.
const row = (rowNumber: number, date: string, miles: number, sheetMilesDriven?: number) => ({ rowNumber, date, miles, sheetMilesDriven });

describe("recalculateMilesDriven", () => {
  it("[AC-MIL-04.2] miles driven is the next start reading minus this one, and the last row has none", () => {
    const result = recalculateMilesDriven([
      { date: "2026-01-02", miles: 1000 },
      { date: "2026-01-09", miles: 1120 },
      { date: "2026-01-16", miles: 1150 },
    ]);
    expect(result.get("2026-01-02")).toBe(120);
    expect(result.get("2026-01-09")).toBe(30);
    expect(result.has("2026-01-16")).toBe(false);
  });

  it("[AC-MIL-04.2] does not depend on the order of the rows and spans a skipped Friday", () => {
    const result = recalculateMilesDriven([
      { date: "2026-01-23", miles: 1400 },
      { date: "2026-01-02", miles: 1000 },
      { date: "2026-01-09", miles: 1100 },
    ]);
    expect(result.get("2026-01-09")).toBe(300);
    expect(result.get("2026-01-02")).toBe(100);
  });
});

describe("previewImportRows", () => {
  it("[AC-MIL-04.2][AC-MIL-04.3] uses the recalculated value and flags rows where the sheet's value differs", () => {
    const preview = previewImportRows([row(2, "2026-01-02", 1000, 120), row(3, "2026-01-09", 1120, 99), row(4, "2026-01-16", 1150, 5)]);
    expect(preview.map((p) => [p.rowNumber, p.milesDriven, p.sheetMilesDriven, p.flagged])).toEqual([
      [2, 120, 120, false],
      [3, 30, 99, true],
      [4, undefined, 5, false], // the last row has nothing to compare with
    ]);
  });

  it("[AC-MIL-04.3] a row without a sheet value is not flagged", () => {
    expect(previewImportRows([row(2, "2026-01-02", 1000), row(3, "2026-01-09", 1120)]).map((p) => p.flagged)).toEqual([false, false]);
  });
});

describe("importMileageRequestSchema", () => {
  const ok = { rows: [{ date: "2026-01-02", miles: 1000 }] };

  it("[AC-MIL-04.1] accepts rows with a calendar date and whole miles", () => {
    expect(importMileageRequestSchema.safeParse(ok).success).toBe(true);
  });

  it("[AC-MIL-04.1] rejects impossible dates, bad miles, extra fields, no rows and too many rows", () => {
    const bad = (rows: unknown) => importMileageRequestSchema.safeParse({ rows }).success;
    expect(bad([{ date: "2026-02-30", miles: 1 }])).toBe(false);
    expect(bad([{ date: "01/02/2026", miles: 1 }])).toBe(false);
    expect(bad([{ date: "2026-01-02", miles: -1 }])).toBe(false);
    expect(bad([{ date: "2026-01-02", miles: 1.5 }])).toBe(false);
    expect(bad([{ date: "2026-01-02", miles: 10_000_000 }])).toBe(false);
    expect(bad([{ date: "2026-01-02", miles: 1, extra: true }])).toBe(false);
    expect(bad([])).toBe(false);
    expect(bad(Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ({ date: "2026-01-02", miles: 1 })))).toBe(false);
  });
});
