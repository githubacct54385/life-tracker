import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// HLT-05: the weekly workout chart on Health, in a real browser at every width. The API edge is faked with synthetic data.
// Behaviour (weeks, streak, goal rules) is proven in unit tests; this checks the chart draws, fits and works by keyboard-friendly controls.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

test(
  "[AC-HLT-05.7] the weekly workout chart is drawn with a text table, and the page does not scroll sideways at any width",
  { tag: ["@AC-HLT-05.7"] },
  async ({ page, context }) => {
    const now = new Date();
    const day = (back: number) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const types = ["Run", "Yoga", "Strength", "Walk"];
    const workouts = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, date: day(i * 4), type: types[i % 4], minutes: 20 + i, reps: null, note: null, source: "manual" }));
    await page.route("**/api/workouts", (route) => route.fulfill({ json: { workouts } }));
    await page.route("**/api/workouts/goal", (route) => route.fulfill({ json: { perWeek: 3 } }));
    await signInAs(context, OWNER);
    for (const { width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto("/health");
      const section = page.getByRole("region", { name: "Weekly workouts" });
      await expect(section.getByText(/^Goal: 3 a week\./)).toBeVisible();
      const chart = section.getByRole("img", { name: /last 12 weeks/ });
      await expect(chart).toBeVisible();
      await expect(chart.locator(".recharts-bar-rectangle").first()).toBeVisible(); // bars are drawn, not an empty box
      expect((await chart.boundingBox())!.width).toBeLessThanOrEqual(width);
      await section.getByText("Show the numbers as a table").click();
      await expect(section.getByRole("table", { name: /last 12 weeks/ })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${width}px`).toBeLessThanOrEqual(0);
    }
  },
);
