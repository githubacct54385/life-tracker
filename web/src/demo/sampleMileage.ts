// The built-in sample file for the demo mileage import (DEM-02). It is generated here, in code: no spreadsheet file is stored in the
// repository (AGENTS.md hard rule 3), and the odometer readings are invented.

/** Invented miles driven in each week, oldest first. */
const WEEKLY_MILES = [212, 187, 240, 155, 201, 268, 190, 176, 233];
const START_MILES = 30_100;
/** Index of the row whose Miles Driven the "sheet" gets wrong, so the preview shows what a flagged row looks like. */
const WRONG_SHEET_ROW = 3;

const pad = (n: number) => String(n).padStart(2, "0");

/** The sample as CSV text: a Date column, a Start Miles column and a Miles Driven column, one row per Friday from 2026-01-02. */
export function sampleMileageCsv(): string {
  const lines = ["Date,Start Miles (Friday),Miles Driven"];
  let miles = START_MILES;
  let day = Date.UTC(2026, 0, 2);
  WEEKLY_MILES.forEach((driven, index) => {
    const d = new Date(day);
    const shown = index === WRONG_SHEET_ROW ? driven + 20 : driven;
    lines.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())},${miles},${shown}`);
    miles += driven;
    day += 7 * 86_400_000;
  });
  // The last Friday has no Miles Driven yet, as in a real sheet.
  const last = new Date(day);
  lines.push(`${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())},${miles},`);
  return `${lines.join("\n")}\n`;
}

/** The sample as a file, handed to the same reader the real import uses. */
export const sampleMileageFile = (): File => new File([sampleMileageCsv()], "sample-mileage.csv", { type: "text/csv" });
