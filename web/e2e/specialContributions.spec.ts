import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// The one browser test for GIV-02: the real page in a real browser, at every width. The API edge is faked with
// synthetic contributions, because the end-to-end server has no database. Behaviour is proven in unit and integration tests.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

test(
  "[AC-GIV-02.1][AC-GIV-02.2] special contributions have an occasion and no month, are totaled on their own, and nothing scrolls sideways at 360, 768 and 1280 px",
  { tag: ["@AC-GIV-02.1", "@AC-GIV-02.2"] },
  async ({ page, context }) => {
    await page.route("**/api/gifts/special", (route) =>
      route.fulfill({
        json: {
          contributions: [
            { id: 2, dateGiven: "2026-09-14", occasion: "Building fund appeal", cents: 25_000, method: "check" },
            { id: 1, dateGiven: "2026-03-29", occasion: "Spring offering", cents: 10_000, method: "card" },
          ],
        },
      }),
    );
    await signInAs(context, OWNER);
    for (const { width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto("/giving/special");
      await expect(page.getByLabel("Name or occasion")).toBeVisible();
      await expect(page.getByLabel("Month it is for")).toHaveCount(0);
      await expect(page.getByLabel("Special contributions total")).toHaveText("$350.00");
      await expect(page.getByText("Building fund appeal")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  },
);
