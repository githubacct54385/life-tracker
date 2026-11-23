import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// The one browser test for GIV-03: the real page in a real browser, at every width. The API edge is faked with
// synthetic gifts, because the end-to-end server has no database. Behaviour is proven in unit tests.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

test(
  "[AC-GIV-03.2][AC-GIV-03.3] giving shows year totals and marks a month with no gift, with nothing scrolling sideways at 360, 768 and 1280 px",
  { tag: ["@AC-GIV-03.2", "@AC-GIV-03.3"] },
  async ({ page, context }) => {
    // Gifts for the two months before the current one, so the current month is marked "No gift" whatever today is.
    const now = new Date();
    const month = (back: number) => {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };
    await page.route("**/api/gifts", (route) =>
      route.fulfill({
        json: {
          gifts: [
            { id: 2, dateGiven: `${month(1)}-05`, forMonth: month(1), cents: 15_000, method: "card", description: null },
            { id: 1, dateGiven: `${month(2)}-05`, forMonth: month(2), cents: 15_000, method: "check", description: null },
          ],
        },
      }),
    );
    await page.route("**/api/gifts/special", (route) => route.fulfill({ json: { contributions: [] } }));
    await signInAs(context, OWNER);
    for (const { width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto("/giving");
      await expect(page.getByRole("region", { name: /Year to date|Total for/ })).toBeVisible();
      await expect(page.getByText("No gift").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  },
);

test(
  "[AC-GIV-04.6] the giving chart and its table fit at 360, 768 and 1280 px, with nothing scrolling sideways",
  { tag: ["@AC-GIV-04.6"] },
  async ({ page, context }) => {
    const year = new Date().getFullYear();
    await page.route("**/api/gifts", (route) =>
      route.fulfill({ json: { gifts: [{ id: 1, dateGiven: `${year}-01-05`, forMonth: `${year}-01`, cents: 15_000, method: "card", description: null }] } }),
    );
    await page.route("**/api/gifts/special", (route) =>
      route.fulfill({ json: { contributions: [{ id: 1, dateGiven: `${year}-01-20`, occasion: "Example fund", cents: 5_000, method: "check" }] } }),
    );
    await signInAs(context, OWNER);
    for (const { width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto("/giving");
      const chart = page.getByRole("region", { name: "Giving by month" });
      await expect(chart.getByRole("img", { name: /^Bar chart of giving in each month/ })).toBeVisible();
      await expect(chart.locator("svg").first()).toBeVisible();
      await chart.getByText("Show the numbers as a table").click();
      await expect(chart.getByRole("table", { name: `Giving by month in ${year}` })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  },
);
