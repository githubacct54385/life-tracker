import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// The one browser test for MIL-04: the real page and a real file chooser, at every width. The file is generated here from
// invented values (never stored in the repo) and the API edge is faked. Parsing and import rules are proven in unit tests.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];
const CSV = "Date,Start Miles (Friday),Miles Driven\n2026-01-02,1000,120\n2026-01-09,1120,99\n2026-01-16,1150,\n";

test(
  "[AC-MIL-04.3] the preview flags a row that differs from the sheet, and nothing scrolls sideways at 360, 768 and 1280 px",
  { tag: "@AC-MIL-04.3" },
  async ({ page, context }) => {
    const uploads: string[] = [];
    await page.route("**/api/odometer/import", (route) => {
      uploads.push(route.request().postData() ?? "");
      return route.fulfill({ json: { imported: 3, duplicates: 0 } });
    });
    await signInAs(context, OWNER);
    for (const { width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto("/car/import");
      await page.getByLabel("Spreadsheet file").setInputFiles({ name: "history.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
      await expect(page.getByText("3 readings found.")).toBeVisible();
      await expect(page.getByText("Check: sheet says 99")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
    await page.getByRole("button", { name: "Import 3 readings" }).click();
    await expect(page.getByRole("status")).toContainText("Imported 3 readings");
    // AC-MIL-04.5: the request carries parsed rows as JSON, not the file.
    expect(JSON.parse(uploads[0]!)).toEqual({ rows: [{ date: "2026-01-02", miles: 1000 }, { date: "2026-01-09", miles: 1120 }, { date: "2026-01-16", miles: 1150 }] });
  },
);
