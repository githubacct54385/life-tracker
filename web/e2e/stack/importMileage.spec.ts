import { expect, test } from "../support/stack";

// MIL-04, full stack: a spreadsheet is read in the browser, and only the rows go to the real API and database.
// The file is generated here with invented numbers. No spreadsheet is stored in the repository.
const csv = ["Date,Start Miles,Miles Driven", "2026-09-04,46000,200", "2026-09-11,46200,210", "2026-09-18,46410,190"].join("\n");

test("[AC-MIL-04.1][AC-MIL-04.4][AC-OPS-04.3] a CSV is imported into the database, and importing the same file again adds nothing", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/car/import");
  const file = { name: "history.csv", mimeType: "text/csv", buffer: Buffer.from(csv) };
  await page.getByLabel("Spreadsheet file").setInputFiles(file);
  await expect(page.getByRole("region", { name: "Preview" })).toBeVisible();
  await page.getByRole("button", { name: "Import 3 readings" }).click();
  await expect(page.getByRole("status")).toContainText("Imported 3 readings. 0 were already saved");

  await page.goto("/car/log");
  const recent = page.getByRole("region", { name: "Recent readings" });
  await expect(recent.getByText("46,410 mi", { exact: true })).toBeVisible();
  await expect(recent.getByText("46,000 mi", { exact: true })).toBeVisible();

  await page.goto("/car/import");
  await page.getByLabel("Spreadsheet file").setInputFiles(file);
  await page.getByRole("button", { name: "Import 3 readings" }).click();
  await expect(page.getByRole("status")).toContainText("Imported 0 readings. 3 were already saved and skipped.");
});

test("[AC-MIL-04.1][AC-OPS-04.3] a file with no Date and Start Miles columns is refused with a clear message and nothing is saved", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/car/import");
  await page.getByLabel("Spreadsheet file").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("Name,Colour\nA,red\n") });
  await expect(page.getByRole("alert")).toContainText("Date column and a Start Miles column");
  await page.goto("/car/log");
  await expect(page.getByText(/No readings yet/)).toBeVisible();
});
