import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// MIL-10: the cost charts on Car > Maintenance, in a real browser at every width and in both themes. The API edge is faked with
// synthetic data. The sums and splits are proven in unit tests; this checks the charts draw, fit, and pass the contrast scan.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

function day(back: number) {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const joes = { id: 1, name: "Joe's Garage With A Long Name" };
const acme = { id: 2, name: "Acme Tire" };

async function mock(page: Page) {
  const records = [
    { id: 5, date: day(5), services: ["Oil change"], doneBy: "home", place: null, costCents: 4500, odometerMiles: 50_100, note: null },
    { id: 4, date: day(40), services: ["Oil change", "Air filter"], doneBy: "shop", place: joes, costCents: 9500, odometerMiles: 48_000, note: null },
    { id: 3, date: day(90), services: ["Tires"], doneBy: "shop", place: acme, costCents: 60_000, odometerMiles: 46_000, note: null },
    { id: 2, date: day(150), services: ["Brakes"], doneBy: "shop", place: joes, costCents: null, odometerMiles: null, note: null },
    { id: 1, date: day(200), services: ["Wipers"], doneBy: "home", place: null, costCents: 1800, odometerMiles: null, note: null },
  ];
  await page.route("**/api/maintenance/places", (r) => r.fulfill({ json: { places: [joes, acme] } }));
  await page.route("**/api/maintenance/documents", (r) => r.fulfill({ json: { documents: [] } }));
  await page.route("**/api/maintenance/intervals", (r) => r.fulfill({ json: { intervals: [] } }));
  await page.route("**/api/maintenance", (r) => r.fulfill({ json: { records } }));
  const readings = Array.from({ length: 12 }, (_, i) => ({ id: 12 - i, date: day(i * 7), miles: 50_000 - i * 300 }));
  await page.route(/\/api\/odometer(\?.*)?$/, (r) => r.fulfill({ json: { readings } }));
}

test("[AC-MIL-10.8] the cost charts are drawn with a text table each, the cost per mile is shown, and nothing scrolls sideways at 360, 768 and 1280 px", { tag: ["@AC-MIL-10.8"] }, async ({ page, context }) => {
  await mock(page);
  await signInAs(context, OWNER);
  for (const { width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.goto("/car/maintenance");
    const section = page.getByRole("region", { name: "Costs" });
    const charts = section.getByRole("img", { name: /^Bar chart:/ });
    await expect(charts).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(charts.nth(i).locator(".recharts-bar-rectangle").first()).toBeVisible();
      expect((await charts.nth(i).boundingBox())!.width).toBeLessThanOrEqual(width);
    }
    await expect(section.getByText(/Cost per mile:/)).toContainText("$");
    await expect(section.getByText("1 service has no cost and is left out of these totals.")).toBeVisible();
    await section.getByText("Show the numbers as a table").first().click();
    await expect(section.getByRole("table").first()).toBeVisible();
    await section.getByRole("radio", { name: "Per year" }).check({ force: true });
    await expect(section.getByRole("table", { name: "Spend per year" })).toBeAttached();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px`).toBeLessThanOrEqual(0);
  }
});

for (const scheme of ["light", "dark"] as const) {
  test(`[AC-MIL-10.6] axe finds no WCAG problems on Maintenance with the cost charts drawn, in the ${scheme} theme`, { tag: ["@AC-MIL-10.6"] }, async ({ page, context }) => {
    await mock(page);
    await signInAs(context, OWNER);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/car/maintenance");
    await expect(page.getByRole("region", { name: "Costs" }).getByRole("img", { name: /^Bar chart:/ })).toHaveCount(3);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.map((v) => `${scheme}: ${v.id}: ${v.nodes[0]?.html.slice(0, 90)}`)).toEqual([]);
  });
}
