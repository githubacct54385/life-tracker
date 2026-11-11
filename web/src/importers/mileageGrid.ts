import { importRowSchema, MAX_IMPORT_ROWS, type ImportCandidate } from "@life-tracker/shared";

// Turns a sheet (rows of cells) into odometer readings. Pure: no files, no network. Used by the mileage import (MIL-04);
// `mileageFile.ts` feeds it from an .xlsx or CSV. Nothing is guessed: dates need an explicit format and a bad row is
// reported with its row number while the rest still import (the same approach as the bank layout of ADR-0016).

export type Cell = string | number | boolean | Date | null | undefined;
export type Grid = readonly (readonly Cell[])[];

export interface RowError {
  rowNumber: number;
  reason: "bad_date" | "bad_miles";
}

export interface ParsedSheet {
  rows: ImportCandidate[];
  errors: RowError[];
  /** Set when nothing could be read at all. */
  problem?: "missing_columns" | "too_many_rows";
}

const text = (cell: Cell): string => (cell === null || cell === undefined ? "" : cell instanceof Date ? "" : String(cell).trim());
const isEmptyRow = (row: readonly Cell[]) => row.every((cell) => text(cell) === "" && !(cell instanceof Date));
const pad = (n: number) => String(n).padStart(2, "0");

/** Dates are read only as ISO (2026-01-02), US month/day/year (1/2/2026) or a spreadsheet date cell. */
function toIsoDate(cell: Cell): string | undefined {
  // read-excel-file returns date cells as Dates at UTC midnight, so the UTC parts are the calendar date shown.
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? undefined : `${cell.getUTCFullYear()}-${pad(cell.getUTCMonth() + 1)}-${pad(cell.getUTCDate())}`;
  const value = text(cell);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const parts = iso ? [iso[1], iso[2], iso[3]] : us ? [us[3], us[1], us[2]] : undefined;
  return parts ? `${parts[0]}-${pad(Number(parts[1]))}-${pad(Number(parts[2]))}` : undefined;
}

/** Whole miles, as a number or as text with optional thousands commas. */
function toMiles(cell: Cell): number | undefined {
  if (typeof cell === "number") return Number.isInteger(cell) ? cell : undefined;
  const value = text(cell);
  return /^\d{1,3}(,\d{3})+$|^\d+$/.test(value) ? Number(value.replace(/,/g, "")) : undefined;
}

const columnOf = (header: readonly Cell[], matches: (name: string) => boolean) => header.findIndex((cell) => matches(text(cell).toLowerCase()));

export function parseMileageGrid(grid: Grid): ParsedSheet {
  const headerIndex = grid.findIndex((row) => columnOf(row, (n) => n === "date") >= 0 && columnOf(row, (n) => n.startsWith("start miles")) >= 0);
  if (headerIndex < 0) return { rows: [], errors: [], problem: "missing_columns" };
  const header = grid[headerIndex]!;
  const dateAt = columnOf(header, (n) => n === "date");
  const milesAt = columnOf(header, (n) => n.startsWith("start miles"));
  const drivenAt = columnOf(header, (n) => n.startsWith("miles driven"));

  const body = grid.slice(headerIndex + 1);
  if (body.filter((row) => !isEmptyRow(row)).length > MAX_IMPORT_ROWS) return { rows: [], errors: [], problem: "too_many_rows" };

  const rows: ImportCandidate[] = [];
  const errors: RowError[] = [];
  body.forEach((cells, offset) => {
    if (isEmptyRow(cells)) return;
    const rowNumber = headerIndex + offset + 2; // 1-based, like the row numbers in the spreadsheet program
    const date = toIsoDate(cells[dateAt]);
    const miles = toMiles(cells[milesAt]);
    if (date === undefined || !importRowSchema.safeParse({ date, miles: 0 }).success) {
      errors.push({ rowNumber, reason: "bad_date" });
      return;
    }
    if (miles === undefined || !importRowSchema.safeParse({ date, miles }).success) {
      errors.push({ rowNumber, reason: "bad_miles" });
      return;
    }
    const driven = drivenAt >= 0 ? toMiles(cells[drivenAt]) : undefined;
    rows.push(driven === undefined ? { rowNumber, date, miles } : { rowNumber, date, miles, sheetMilesDriven: driven });
  });
  return { rows, errors };
}

/** A small CSV reader: standard quoting, a UTF-8 byte-order mark and Windows line endings are tolerated. */
export function parseCsv(input: string): string[][] {
  const source = input.startsWith("\uFEFF") ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let touched = false; // anything seen on this line, so a trailing newline does not add an empty row
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
      touched = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      touched = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      touched = false;
    } else {
      field += ch;
      touched = true;
    }
  }
  if (touched || field !== "") {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
