import { describe, expect, it } from "vitest";
import { previewImportRows } from "@life-tracker/shared";
import { parseCsv, parseMileageGrid } from "../importers/mileageGrid";
import { readMileageFile } from "../importers/mileageFile";
import { sampleMileageCsv, sampleMileageFile } from "./sampleMileage";

describe("demo sample mileage file", () => {
  it("[AC-DEM-02.1] is generated in code as a CSV with the columns the real import reads", () => {
    const grid = parseCsv(sampleMileageCsv());
    expect(grid[0]).toEqual(["Date", "Start Miles (Friday)", "Miles Driven"]);
    expect(grid.length).toBe(11); // header, nine weeks and the newest Friday
  });

  it("[AC-DEM-02.1] reads cleanly with the real parser: ten readings on Fridays and no errors", () => {
    const parsed = parseMileageGrid(parseCsv(sampleMileageCsv()));
    expect(parsed.problem).toBeUndefined();
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(10);
    for (const row of parsed.rows) expect(new Date(`${row.date}T00:00:00Z`).getUTCDay()).toBe(5);
  });

  it("[AC-DEM-02.1] has one row whose Miles Driven the sheet gets wrong, so the preview shows a flagged row", () => {
    const rows = previewImportRows(parseMileageGrid(parseCsv(sampleMileageCsv())).rows);
    expect(rows.filter((r) => r.flagged)).toHaveLength(1);
  });

  it("[AC-DEM-02.1] is a File the real file reader accepts, with only invented odometer readings", async () => {
    const file = sampleMileageFile();
    expect(file.name).toBe("sample-mileage.csv");
    const outcome = await readMileageFile(file);
    expect(outcome.rows).toHaveLength(10);
    // Invented range: well away from the demo's own odometer history, and increasing week by week.
    const miles = outcome.rows.map((r) => r.miles);
    expect(miles).toEqual([...miles].sort((a, b) => a - b));
    expect(miles[0]).toBe(30_100);
  });
});
