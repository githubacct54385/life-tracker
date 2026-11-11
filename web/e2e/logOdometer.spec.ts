import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// The one browser test for MIL-01: the real page in a real browser, at every width. The API edge is faked with
// synthetic readings, because the end-to-end server has no database. Behaviour is proven in unit and integration tests.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

test(
  "[AC-MIL-01.1] the reading field has focus when the screen opens, there is no date field, and nothing scrolls sideways at 360, 768 and 1280 px",
  { tag: "@AC-MIL-01.1" },
  async ({ page, context }) => {
    await page.route("**/api/odometer", (route) =>
      route.fulfill({
        json: { readings: [{ id: 2, date: "2026-11-06", miles: 48_402 }, { id: 1, date: "2026-10-30", miles: 48_190 }] },
      }),
    );
    await signInAs(context, OWNER);
    for (const { width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto("/car/log");
      await expect(page.getByLabel("Odometer reading")).toBeFocused();
      await expect(page.getByText("Nov 6")).toBeVisible();
      await expect(page.locator('input[type="date"], input[type="datetime-local"], input[type="time"]')).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  },
);
