import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// The one browser test for HLT-01: the real page in a real browser, at every width. The API edge is faked with
// synthetic weights, because the end-to-end server has no database. Behaviour is proven in unit and integration tests.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

test(
  "[AC-HLT-01.1][AC-HLT-01.2] the weight screen has no date field, draws the chart with a text alternative, and nothing scrolls sideways at 360, 768 and 1280 px",
  { tag: ["@AC-HLT-01.1", "@AC-HLT-01.2"] },
  async ({ page, context }) => {
    const entries = [172.0, 172.6, 171.9, 172.3, 171.5, 171.8, 171.2].map((pounds, i) => ({ id: 7 - i, date: `2026-11-${String(17 - i).padStart(2, "0")}`, pounds }));
    await page.route("**/api/weight", (route) => route.fulfill({ json: { entries } }));
    await signInAs(context, OWNER);
    for (const { width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto("/health/weight");
      await expect(page.getByLabel("Weight (lb)")).toBeVisible();
      await expect(page.locator('input[type="date"], input[type="time"], input[type="datetime-local"]')).toHaveCount(0);
      await expect(page.getByRole("img", { name: /Line chart of 7 daily weights/ })).toBeVisible();
      await expect(page.getByRole("region", { name: "Entries" })).toContainText("172.0 lb");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  },
);
