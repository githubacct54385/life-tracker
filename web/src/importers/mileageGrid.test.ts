import { describe, expect, it } from "vitest";
import { parseCsv, parseMileageGrid } from "./mileageGrid";

// Invented values only. Dates are Fridays.
describe("parseMileageGrid", () => {
  it("[AC-MIL-04.1] accepts a sheet with Date and Start Miles columns and reads the sheet's Miles Driven for comparing", () => {
    const result = parseMileageGrid([
      ["Date", "Start Miles (Friday)", "Miles Driven"],
      ["2026-01-02", 1000, 120],
      ["2026-01-09", "1,120", 30],
    ]);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { rowNumber: 2, date: "2026-01-02", miles: 1000, sheetMilesDriven: 120 },
      { rowNumber: 3, date: "2026-01-09", miles: 1120, sheetMilesDriven: 30 },
    ]);
  });

  it("[AC-MIL-04.1] Miles Driven is optional and a title row above the header is skipped", () => {
    const result = parseMileageGrid([["My car"], [], ["start miles", "DATE"], [2000, "1/9/2026"]]);
    expect(result.rows).toEqual([{ rowNumber: 4, date: "2026-01-09", miles: 2000 }]);
  });

  it("[AC-MIL-04.1] reads spreadsheet date cells as the calendar date they show", () => {
    const result = parseMileageGrid([["Date", "Start Miles"], [new Date(Date.UTC(2026, 0, 2)), 1000]]);
    expect(result.rows[0]).toMatchObject({ date: "2026-01-02" });
  });

  it("[AC-MIL-04.1] says so when the Date or Start Miles column is missing", () => {
    expect(parseMileageGrid([["Date", "Miles Driven"], ["2026-01-02", 5]])).toEqual({ rows: [], errors: [], problem: "missing_columns" });
    expect(parseMileageGrid([])).toMatchObject({ problem: "missing_columns" });
  });

  it("[AC-MIL-04.1] rejects a bad row with its row number and still keeps the good ones; empty rows are ignored", () => {
    const result = parseMileageGrid([
      ["Date", "Start Miles"],
      ["2026-01-02", 1000],
      [null, null],
      ["not a date", 1100],
      ["2026-01-16", "abc"],
      ["2026-01-23", 1200.5],
      ["2026-02-30", 1300],
      ["2026-01-30", 1400],
    ]);
    expect(result.rows.map((r) => r.rowNumber)).toEqual([2, 8]);
    expect(result.errors.map((e) => e.rowNumber)).toEqual([4, 5, 6, 7]);
  });

  it("[AC-MIL-04.1] ignores a Miles Driven cell that is not a number instead of failing the row", () => {
    const result = parseMileageGrid([["Date", "Start Miles", "Miles Driven"], ["2026-01-02", 1000, "#REF!"]]);
    expect(result.rows).toEqual([{ rowNumber: 2, date: "2026-01-02", miles: 1000 }]);
  });

  it("[AC-MIL-04.1] refuses more rows than the import limit", () => {
    const grid = [["Date", "Start Miles"], ...Array.from({ length: 5001 }, () => ["2026-01-02", 1])];
    expect(parseMileageGrid(grid)).toMatchObject({ rows: [], problem: "too_many_rows" });
  });
});

describe("parseCsv", () => {
  it("[AC-MIL-04.1] follows standard quoting, tolerates a byte-order mark and Windows line endings", () => {
    expect(parseCsv('﻿Date,"Start Miles"\r\n"2026-01-02","1,000"\r\n\r\n2026-01-09,1120\r\n')).toEqual([
      ["Date", "Start Miles"],
      ["2026-01-02", "1,000"],
      [""],
      ["2026-01-09", "1120"],
    ]);
  });

  it("[AC-MIL-04.1] handles an escaped quote and a newline inside quotes", () => {
    expect(parseCsv('a,"b ""c""\nd"\n')).toEqual([["a", 'b "c"\nd']]);
  });
});
