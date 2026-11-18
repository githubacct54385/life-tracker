import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// The one browser test for DSH-01: the real page in a real browser, at every width. The API edge is faked with
// synthetic data, because the end-to-end server has no database. Behaviour is proven in unit tests.
const WIDTHS = [
  { width: 360, height: 740, columns: 1 },
  { width: 768, height: 1024, columns: 2 },
  { width: 1280, height: 800, columns: 2 },
] as const;

test(
  "[AC-DSH-01.1][AC-DSH-01.3][AC-DSH-01.4] home shows the tiles and quick actions, in one column on a phone and a grid from tablet width, with nothing scrolling sideways",
  { tag: ["@AC-DSH-01.1", "@AC-DSH-01.3", "@AC-DSH-01.4"] },
  async ({ page, context }) => {
    const now = new Date();
    const day = (back: number) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    await page.route("**/api/weight", (route) => route.fulfill({ json: { entries: [{ id: 2, date: day(0), pounds: 172.4 }, { id: 1, date: day(8), pounds: 174 }] } }));
    await page.route("**/api/odometer?all=1", (route) =>
      route.fulfill({ json: { readings: [{ id: 2, date: day(0), miles: 48_402 }, { id: 1, date: day(7), miles: 48_190 }] } }),
    );
    await page.route("**/api/workouts", (route) => route.fulfill({ json: { workouts: [{ id: 1, date: day(0), type: "Run", minutes: 32, note: null, source: "manual" }] } }));
    await page.route("**/api/gifts", (route) => route.fulfill({ json: { gifts: [] } }));
    await page.route("**/api/gifts/special", (route) => route.fulfill({ json: { contributions: [] } }));
    await signInAs(context, OWNER);
    for (const { width, height, columns } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(page.getByRole("region", { name: "Weight" })).toContainText("172.4 lb");
      await expect(page.getByRole("region", { name: "Workouts this week" })).toContainText("1 workout");
      await expect(page.getByRole("region", { name: "Giving this year" })).toBeVisible();
      for (const name of ["Add weight", "Add workout", "Log odometer", "Add giving"]) await expect(page.getByRole("link", { name, exact: true }).first()).toBeVisible();

      // One column on a phone: the first two tiles share a left edge. From tablet width they sit side by side.
      const weight = (await page.getByRole("region", { name: "Weight" }).boundingBox())!;
      const miles = (await page.getByRole("region", { name: "Last week's miles" }).boundingBox())!;
      if (columns === 1) expect(Math.abs(weight.x - miles.x)).toBeLessThan(2);
      else expect(miles.x).toBeGreaterThan(weight.x + weight.width - 2);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  },
);
