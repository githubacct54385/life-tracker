import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// The one browser test for GIV-01: the real page in a real browser, at every width. The API edge is faked with
// synthetic gifts, because the end-to-end server has no database. Behaviour is proven in unit and integration tests.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

test(
  "[AC-GIV-01.1] the gift form has a date but no time field, gifts are listed by month, and nothing scrolls sideways at 360, 768 and 1280 px",
  { tag: "@AC-GIV-01.1" },
  async ({ page, context }) => {
    await page.route("**/api/gifts", (route) =>
      route.fulfill({
        json: {
          gifts: [
            { id: 2, dateGiven: "2026-11-02", forMonth: "2026-10", cents: 15_000, method: "card" },
            { id: 1, dateGiven: "2026-10-05", forMonth: "2026-10", cents: 5_000, method: "check" },
          ],
        },
      }),
    );
    await signInAs(context, OWNER);
    for (const { width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto("/giving/log");
      await expect(page.getByLabel("Date given")).toBeVisible();
      await expect(page.getByLabel("Month it is for")).toBeVisible();
      await expect(page.getByRole("group", { name: "October 2026" })).toContainText("$200.00");
      await expect(page.locator('input[type="time"], input[type="datetime-local"]')).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  },
);
