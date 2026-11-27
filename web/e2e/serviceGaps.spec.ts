import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// MIL-11: the service gaps chart on Car > Maintenance, in a real browser at every width and in both themes. The API edge is faked with
// synthetic data. The gap rules are proven in unit tests; this checks the chart draws, fits, passes the contrast scan, and is skipped by Tab.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;
const RECORDS = [
  { id: 4, date: "2026-10-20", services: ["Oil change"], doneBy: "home", place: null, costCents: 4500, odometerMiles: 50_100, note: null },
  { id: 3, date: "2026-07-02", services: ["Oil change", "Tires"], doneBy: "home", place: null, costCents: 9000, odometerMiles: 47_300, note: null },
  { id: 2, date: "2026-05-10", services: ["Oil change"], doneBy: "home", place: null, costCents: 4500, odometerMiles: 44_800, note: null },
  { id: 1, date: "2026-01-10", services: ["Oil change"], doneBy: "home", place: null, costCents: 4500, odometerMiles: 40_000, note: null },
];

async function mock(page: Page) {
  await page.route("**/api/maintenance/places", (r) => r.fulfill({ json: { places: [] } }));
  await page.route("**/api/maintenance/documents", (r) => r.fulfill({ json: { documents: [] } }));
  await page.route("**/api/maintenance/intervals", (r) => r.fulfill({ json: { intervals: [{ id: 1, service: "Oil change", miles: 5000, months: 6 }] } }));
  await page.route("**/api/maintenance", (r) => r.fulfill({ json: { records: RECORDS } }));
  await page.route(/\/api\/odometer(\?.*)?$/, (r) => r.fulfill({ json: { readings: [{ id: 2, date: "2026-11-06", miles: 50_400 }] } }));
}

test("[AC-MIL-11.6] the gaps chart is drawn with its interval line and a text table, fits at 360, 768 and 1280 px, and does not scroll sideways", { tag: ["@AC-MIL-11.6"] }, async ({ page, context }) => {
  await mock(page);
  await signInAs(context, OWNER);
  for (const { width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.goto("/car/maintenance");
    const section = page.getByRole("region", { name: "Time between services" });
    const chart = section.getByRole("img", { name: /miles between each visit for Oil change/ });
    await expect(chart).toBeVisible();
    await expect(chart.locator(".recharts-bar-rectangle").first()).toBeVisible();
    // The interval line (5,000 miles) is drawn inside the chart even though every gap is under it: the axis is extended to hold it.
    const line = chart.locator(".recharts-reference-line line");
    await expect(line).toHaveCount(1);
    const y = Number(await line.getAttribute("y1"));
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan((await chart.boundingBox())!.height);
    expect((await chart.boundingBox())!.width).toBeLessThanOrEqual(width);
    await section.getByText("Show the numbers as a table").click();
    await expect(section.getByRole("table")).toBeVisible();
    await section.getByRole("radio", { name: "Days" }).check({ force: true });
    await expect(section.getByRole("img", { name: /days between each visit/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px`).toBeLessThanOrEqual(0);
  }
});

for (const scheme of ["light", "dark"] as const) {
  test(`[AC-MIL-11.6] axe finds no WCAG problems on Maintenance with the gaps chart drawn, in the ${scheme} theme`, { tag: ["@AC-MIL-11.6"] }, async ({ page, context }) => {
    await mock(page);
    await signInAs(context, OWNER);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/car/maintenance");
    await expect(page.getByRole("region", { name: "Time between services" }).locator(".recharts-bar-rectangle").first()).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.map((v) => `${scheme}: ${v.id}: ${v.nodes[0]?.html.slice(0, 90)}`)).toEqual([]);
  });
}
