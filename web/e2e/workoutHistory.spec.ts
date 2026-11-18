import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// The one browser test for HLT-04: the real page in a real browser, at every width. The API edge is faked with
// synthetic workouts, because the end-to-end server has no database. Behaviour is proven in unit tests.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

test(
  "[AC-HLT-04.1][AC-HLT-04.2][AC-HLT-04.3] health shows the history, weekly and monthly totals and the streak, with nothing scrolling sideways at 360, 768 and 1280 px",
  { tag: ["@AC-HLT-04.1", "@AC-HLT-04.2", "@AC-HLT-04.3"] },
  async ({ page, context }) => {
    const now = new Date();
    const day = (back: number) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    await page.route("**/api/workouts", (route) =>
      route.fulfill({
        json: {
          workouts: [
            { id: 3, date: day(0), type: "Yoga", minutes: 40, note: null, source: "manual" },
            { id: 2, date: day(1), type: "Run", minutes: 32, note: null, source: "apple_watch" },
            { id: 1, date: day(2), type: "Strength", minutes: 45, note: null, source: "manual" },
          ],
        },
      }),
    );
    await signInAs(context, OWNER);
    for (const { width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto("/health");
      await expect(page.getByRole("region", { name: "Streak" })).toContainText("day");
      await expect(page.getByRole("table", { name: /per week/ })).toBeVisible();
      await expect(page.getByRole("table", { name: /per month/ })).toBeVisible();
      await expect(page.getByRole("region", { name: "History" })).toContainText("Yoga, 40 min");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  },
);
