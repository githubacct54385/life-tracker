import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// The one browser test for HLT-02: the real page in a real browser, at every width. The API edge is faked with
// synthetic workouts, because the end-to-end server has no database. Behaviour is proven in unit and integration tests.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

test(
  "[AC-HLT-02.1][AC-HLT-02.3] the workout form has no date field, each workout shows its source, and nothing scrolls sideways at 360, 768 and 1280 px",
  { tag: ["@AC-HLT-02.1", "@AC-HLT-02.3"] },
  async ({ page, context }) => {
    await page.route("**/api/workouts", (route) =>
      route.fulfill({
        json: {
          workouts: [
            { id: 2, date: "2026-11-06", type: "Yoga", minutes: 40, note: "A long synthetic note that should wrap rather than push the page sideways", source: "manual" },
            { id: 1, date: "2026-11-05", type: "Run", minutes: 32, note: null, source: "apple_watch" },
          ],
        },
      }),
    );
    await signInAs(context, OWNER);
    for (const { width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto("/health/workouts");
      await expect(page.getByLabel("Duration (minutes)")).toBeVisible();
      await expect(page.getByText("Apple Watch")).toBeVisible();
      await expect(page.getByText("Manual")).toBeVisible();
      await expect(page.locator('input[type="date"], input[type="datetime-local"], input[type="time"]')).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  },
);
