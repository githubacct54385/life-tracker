import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// OPS-14: when a part the Worker depends on is down, the banner is shown on every page, fits every width, passes the contrast scan in
// both themes, and goes away by itself when the part is back. The API edge is faked: the database "is down" for every call but the check.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;
const BANNER = "The database is not available right now. Please try again in a few minutes. Your saved data is safe.";

async function databaseDown(page: Page, state: { up: boolean }) {
  await page.route("**/api/health/parts", (route) => route.fulfill({ json: { database: state.up ? "ok" : "unavailable", documents: "ok", signIn: "ok" } }));
  await page.route(/\/api\/(?!health)/, (route) =>
    state.up ? route.fulfill({ json: { readings: [], entries: [], workouts: [], gifts: [], contributions: [], records: [], items: [], documents: [], places: [], intervals: [], perWeek: null } }) : route.fulfill({ status: 503, json: { error: "unavailable", part: "database" } }),
  );
}

test("[AC-OPS-14.3][AC-OPS-14.6] the banner shows on a page whose data could not load, fits at 360, 768 and 1280 px, and does not scroll sideways", { tag: ["@AC-OPS-14.6"] }, async ({ page, context }) => {
  test.setTimeout(90_000);
  await databaseDown(page, { up: false });
  await signInAs(context, OWNER);
  for (const { width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.goto("/car");
    await page.goto("/giving");
    const banner = page.getByRole("status").filter({ hasText: BANNER });
    await expect(banner).toBeVisible({ timeout: 20_000 });
    // The page shows the plain message where its data would be, not a blank area.
    await expect(page.getByText("The database is not available right now. Try again in a few minutes.")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px`).toBeLessThanOrEqual(0);
    expect((await banner.boundingBox())!.width).toBeLessThanOrEqual(width);
  }
});

for (const scheme of ["light", "dark"] as const) {
  test(`[AC-OPS-14.6] axe finds no WCAG problems with the banner showing, in the ${scheme} theme`, { tag: ["@AC-OPS-14.6"] }, async ({ page, context }) => {
    test.setTimeout(60_000);
    await databaseDown(page, { up: false });
    await signInAs(context, OWNER);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/giving");
    await expect(page.getByRole("status").filter({ hasText: BANNER })).toBeVisible({ timeout: 20_000 });
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.map((v) => `${scheme}: ${v.id}: ${v.nodes[0]?.html.slice(0, 90)}`)).toEqual([]);
  });
}

test("[AC-OPS-14.3] the banner goes away by itself, without a reload, once the part is back", { tag: ["@AC-OPS-14.3"] }, async ({ page, context }) => {
  test.setTimeout(120_000);
  const state = { up: false };
  await databaseDown(page, state);
  await signInAs(context, OWNER);
  await page.clock.install();
  await page.goto("/giving");
  const banner = page.getByRole("status").filter({ hasText: BANNER });
  await expect(banner).toBeVisible({ timeout: 20_000 });
  state.up = true;
  await page.clock.runFor(31_000);
  await expect(banner).toHaveCount(0);
});
