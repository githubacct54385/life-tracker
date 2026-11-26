import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// HLT-06: the weight and workouts chart on Health, in a real browser at every width and in both themes. The API edge is faked with
// synthetic data. The week and weight rules are proven in unit tests; this checks the chart draws, fits, and passes the contrast scan.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

async function mock(page: import("@playwright/test").Page) {
  const now = new Date();
  const day = (back: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const entries = Array.from({ length: 14 }, (_, i) => ({ id: i + 1, date: day(i * 6), pounds: 175 - i * 0.4 }));
  const workouts = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, date: day(i * 4), type: ["Run", "Yoga"][i % 2], minutes: 20 + i, reps: null, note: null, source: "manual" }));
  await page.route("**/api/weight", (route) => route.fulfill({ json: { entries } }));
  await page.route("**/api/workouts", (route) => route.fulfill({ json: { workouts } }));
  await page.route("**/api/workouts/goal", (route) => route.fulfill({ json: { perWeek: 3 } }));
}

test("[AC-HLT-06.5] the weight and workouts chart is drawn with both scales and a text table, and the page does not scroll sideways at any width", { tag: ["@AC-HLT-06.5"] }, async ({ page, context }) => {
  await mock(page);
  await signInAs(context, OWNER);
  for (const { width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.goto("/health");
    const section = page.getByRole("region", { name: "Weight and workouts" });
    const chart = section.getByRole("img", { name: /weight and workout minutes over the last 6 months/ });
    await expect(chart).toBeVisible();
    await expect(chart.locator(".recharts-bar-rectangle").first()).toBeVisible(); // bars are drawn
    await expect(chart.locator(".recharts-line-curve")).toBeVisible(); // and so is the line
    expect((await chart.boundingBox())!.width).toBeLessThanOrEqual(width);
    await section.getByText("Show the numbers as a table").click();
    await expect(section.getByRole("table", { name: /last 6 months/ })).toBeVisible();
    await section.getByRole("radio", { name: "3 months" }).check({ force: true });
    await expect(section.getByRole("img", { name: /last 3 months/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px`).toBeLessThanOrEqual(0);
  }
});

for (const scheme of ["light", "dark"] as const) {
  test(`[AC-HLT-06.5] axe finds no WCAG problems on Health with the weight and workouts chart drawn, in the ${scheme} theme`, { tag: ["@AC-HLT-06.5"] }, async ({ page, context }) => {
    await mock(page);
    await signInAs(context, OWNER);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/health");
    const section = page.getByRole("region", { name: "Weight and workouts" });
    await expect(section.locator(".recharts-line-curve")).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.map((v) => `${scheme}: ${v.id}: ${v.nodes[0]?.html.slice(0, 90)}`)).toEqual([]);
  });
}
