import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// MIL-03 in a real browser at every width. The API edge is faked with synthetic readings, because the end-to-end
// server has no database. The numbers themselves are proven in unit tests.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

// Ten weekly readings with one missed week, newest first.
const READINGS = [
  [10, "2026-11-06", 48_402], [9, "2026-10-30", 48_190], [8, "2026-10-23", 47_978], [7, "2026-10-16", 47_790],
  [6, "2026-10-09", 47_600], [5, "2026-10-02", 47_410], [4, "2026-09-18", 47_050], [3, "2026-09-11", 46_880],
  [2, "2026-09-04", 46_700], [1, "2026-08-28", 46_500],
].map(([id, date, miles]) => ({ id, date, miles }));

test(
  "[AC-MIL-03.4] the chart is drawn, has a text alternative, and nothing scrolls sideways at 360, 768 and 1280 px",
  { tag: "@AC-MIL-03.4" },
  async ({ page, context }) => {
    await page.route("**/api/odometer?all=1", (route) => route.fulfill({ json: { readings: READINGS } }));
    await signInAs(context, OWNER);
    for (const { width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto("/car/stats");
      const chart = page.getByRole("img", { name: /Bar chart of miles driven/ });
      await expect(chart).toBeVisible();
      await expect(chart.locator(".recharts-bar-rectangle").first()).toBeVisible();
      const box = (await chart.boundingBox())!;
      expect(box.width).toBeGreaterThan(Math.min(width - 80, 250));
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  },
);
